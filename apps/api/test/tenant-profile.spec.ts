import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBranchesService, makeProvincesService } from './helpers/service-factory';

/**
 * Hồ sơ gian hàng (`PATCH /tenants/current/profile`) — chạy trên PostgreSQL THẬT.
 *
 * Ba bất biến được khoá ở đây, cả ba đều hỏng ÂM THẦM nếu ai đó "đơn giản hoá" service:
 *
 * 1. **Tỉnh/thành đi qua chi nhánh mặc định.** Hai cột tỉnh trên `tenant_profiles` là bản SAO;
 *    ghi thẳng vào chúng đúng cho tới lần chạm chi nhánh kế tiếp rồi bị ghi đè, và trong lúc đó
 *    xe vẫn nằm ở tỉnh cũ trên marketplace.
 * 2. **Đang chờ duyệt là khoá ghi thật, không phải một thuộc tính `disabled` ở frontend.**
 * 3. **Ô để trống = NULL**, không phải chuỗi rỗng — và SĐT chủ shop lưu ở DẠNG CHUẨN `84…`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const branches = makeBranchesService(asService);
const tenants = new TenantsService(
  asService,
  new AuditService(asService),
  makeProvincesService(asService),
  branches,
);

const HCM = '79';
const DANANG = '48';

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  tenantId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop hồ sơ',
      status: TENANT_STATUS.DRAFT,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({ data: { tenantId, displayName: 'Shop hồ sơ' } });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await branches.create(tenantId, ownerId, { name: 'Chi nhánh gốc', provinceCode: HCM });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.approvalLog.deleteMany({ where: { task: { tenantId } } });
    await prisma.approvalTask.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Thông tin chủ gian hàng', () => {
  maybe('lưu và trả về đủ ba trường; SĐT về dạng chuẩn 84…', async () => {
    const shop = await tenants.updateProfile(tenantId, ownerId, {
      ownerFullName: 'Nguyễn Văn A',
      ownerPhone: '84901234567',
      ownerEmail: 'chu@xeprime.vn',
    });

    expect(shop.profile.ownerFullName).toBe('Nguyễn Văn A');
    expect(shop.profile.ownerPhone).toBe('84901234567');
    expect(shop.profile.ownerEmail).toBe('chu@xeprime.vn');
  });

  maybe('ô để trống lưu thành NULL, không phải chuỗi rỗng', async () => {
    await tenants.updateProfile(tenantId, ownerId, { ownerEmail: '', taxCode: '' });

    const row = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { ownerEmail: true, taxCode: true },
    });
    expect(row.ownerEmail).toBeNull();
    expect(row.taxCode).toBeNull();
  });

  maybe('hồ sơ gửi duyệt mang theo thông tin chủ gian hàng cho người duyệt', async () => {
    await tenants.updateProfile(tenantId, ownerId, { ownerFullName: 'Nguyễn Văn A' });
    const shop = await tenants.submitForReview(tenantId, ownerId);
    expect(shop.status).toBe(TENANT_STATUS.PENDING_REVIEW);

    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });
    expect((task.snapshot as Record<string, unknown>).ownerFullName).toBe('Nguyễn Văn A');
  });

  maybe('đang chờ duyệt: mọi cập nhật hồ sơ bị từ chối ở BACKEND', async () => {
    await expect(
      tenants.updateProfile(tenantId, ownerId, { displayName: 'Đổi lén khi đang chờ' }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });

    const row = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { displayName: true },
    });
    expect(row.displayName).not.toBe('Đổi lén khi đang chờ');

    // Trả về nháp để các test sau chạy trên trạng thái sửa được.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.DRAFT },
    });
  });
});

describe('Tỉnh/thành đi qua chi nhánh mặc định', () => {
  maybe('đổi tỉnh ở hồ sơ = dời chi nhánh mặc định, hai cột sao chép theo sau', async () => {
    const shop = await tenants.updateProfile(tenantId, ownerId, { provinceCode: DANANG });

    expect(shop.defaultBranch?.provinceCode).toBe(DANANG);
    expect(shop.profile.provinceCode).toBe(DANANG);
    expect(shop.profile.provinceName).toBe('Đà Nẵng');

    const branch = await prisma.tenantBranch.findFirstOrThrow({
      where: { tenantId, isDefault: true, deletedAt: null },
      select: { provinceCode: true },
    });
    expect(branch.provinceCode).toBe(DANANG);
  });

  maybe('mã tỉnh không hợp lệ bị từ chối, hồ sơ không đổi gì', async () => {
    await expect(
      tenants.updateProfile(tenantId, ownerId, { provinceCode: 'ZZ', displayName: 'Không được lưu' }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const row = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { displayName: true, provinceCode: true },
    });
    expect(row.displayName).not.toBe('Không được lưu');
    expect(row.provinceCode).toBe(DANANG);
  });
});
