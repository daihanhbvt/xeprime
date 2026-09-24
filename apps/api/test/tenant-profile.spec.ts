import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MEMBERSHIP_STATUS,
  SHOP_PROFILE_REQUIREMENT,
  SHOP_VERIFICATION,
  TENANT_ROLE,
  TENANT_STATUS,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { UpdateTenantProfileDto } from '../src/modules/tenants/dto/tenant-onboarding.dto';
import { makeBranchesService, makeTenantsService } from './helpers/service-factory';

/**
 * Hồ sơ gian hàng (`PATCH /tenants/current/profile`) — chạy trên PostgreSQL THẬT.
 *
 * Ba bất biến được khoá ở đây, cả ba đều hỏng ÂM THẦM nếu ai đó "đơn giản hoá" service:
 *
 * 1. **Tỉnh/thành đi qua chi nhánh mặc định.** Hai cột tỉnh trên `tenant_profiles` là bản SAO;
 *    ghi thẳng vào chúng đúng cho tới lần chạm chi nhánh kế tiếp rồi bị ghi đè, và trong lúc đó
 *    xe vẫn nằm ở tỉnh cũ trên marketplace.
 * 2. **Đang chờ XÁC MINH là khoá ghi thật, không phải một thuộc tính `disabled` ở frontend.**
 * 3. **Ô để trống = NULL**, không phải chuỗi rỗng.
 * 4. **Chủ gian hàng đọc từ TÀI KHOẢN CHỦ**, không từ hồ sơ (16/09/2026): `ownerAccount` phản
 *    chiếu `users`, endpoint hồ sơ KHÔNG sửa được nó, và `submitForReview` chụp nó vào
 *    snapshot thay vì để reviewer đọc giá trị sống.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const branches = makeBranchesService(asService);
const tenants = makeTenantsService(asService);

const HCM = '79';
const DANANG = '48';

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

/**
 * SĐT của tài khoản chủ. `users.phone` là UNIQUE, nên nó phải khác nhau giữa các lần chạy —
 * mốc thời gian là cách rẻ nhất để có điều đó mà vẫn đúng dạng lưu `84` + 9 chữ số.
 */
const OWNER_PHONE = `849${String(Date.now()).slice(-8)}`;

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
    data: {
      id: ownerId,
      displayName: 'Chủ shop',
      email: `own-${ownerId}@xeprime.test`,
      phone: OWNER_PHONE,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop hồ sơ',
      // ADR 0036: gian hàng mở ra là ĐANG HOẠT ĐỘNG ngay; vòng xác minh là trục riêng.
      status: TENANT_STATUS.ACTIVE,
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

/**
 * CHỦ GIAN HÀNG = TÀI KHOẢN CHỦ (16/09/2026).
 *
 * Ba cột `owner_*` trên `tenant_profiles` đã bị drop. Bộ này khoá cả hai nửa của thay đổi đó:
 * khối `ownerAccount` nói đúng thứ `users` đang giữ, và endpoint hồ sơ KHÔNG còn là một đường
 * để ai đó có `tenant.update` viết lại danh tính người chủ.
 */
describe('Thông tin chủ gian hàng', () => {
  maybe('ownerAccount phản chiếu tài khoản chủ, kèm cờ đã-xác-minh', async () => {
    const shop = await tenants.getMyShop(tenantId);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { displayName: true, email: true, phone: true },
    });

    expect(shop.ownerAccount.userId).toBe(ownerId);
    expect(shop.ownerAccount.displayName).toBe(owner.displayName);
    expect(shop.ownerAccount.email).toBe(owner.email);
    expect(shop.ownerAccount.phone).toBe(owner.phone);
    // Mốc `email_verified_at` đặt ở `beforeAll`; SĐT thì chưa ai xác minh.
    expect(shop.ownerAccount.emailVerified).toBe(true);
    expect(shop.ownerAccount.phoneVerified).toBe(false);
  });

  /*
   * Lằn ranh của ADR 0038 điều 3 viết thành test: quyền `tenant.update` mở hồ sơ GIAN HÀNG,
   * không mở tài khoản của người CHỦ.
   *
   * Hai nửa của khẳng định đó: lưu hồ sơ KHÔNG đụng tới khối `ownerAccount`, và khối đó đổi
   * khi — và chỉ khi — chính hàng `users` đổi. Ba khoá `owner_*` cũ không còn cách nào đi vào
   * endpoint này: DTO không khai chúng, nên `forbidNonWhitelisted` trả 400 ngay ở biên.
   */
  maybe('lưu hồ sơ KHÔNG đụng tới danh tính chủ — nó đọc từ users', async () => {
    const before = await tenants.updateProfile(tenantId, ownerId, { displayName: 'Shop hồ sơ' });
    expect(before.ownerAccount.displayName).toBe('Chủ shop');

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Chủ shop đổi tên' } });
    const after = await tenants.getMyShop(tenantId);
    expect(after.ownerAccount.displayName).toBe('Chủ shop đổi tên');

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Chủ shop' } });
  });

  /* DTO không còn khai ba khoá đó — `forbidNonWhitelisted` biến chúng thành 400 ở biên. */
  maybe('UpdateTenantProfileDto không còn nhận ba khoá chủ gian hàng', () => {
    const dto = new UpdateTenantProfileDto() as Record<string, unknown>;
    for (const key of ['ownerFullName', 'ownerPhone', 'ownerEmail']) {
      expect(key in dto).toBe(false);
    }
    return Promise.resolve();
  });

  maybe('ô để trống lưu thành NULL, không phải chuỗi rỗng', async () => {
    await tenants.updateProfile(tenantId, ownerId, { taxCode: '' });

    const row = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { taxCode: true },
    });
    expect(row.taxCode).toBeNull();
  });

  maybe('hồ sơ gửi xác minh CHỤP danh tính chủ cho người duyệt', async () => {
    const shop = await tenants.submitForReview(tenantId, ownerId);
    expect(shop.verification).toBe(SHOP_VERIFICATION.PENDING);
    /*
     * ADR 0036: xin xác minh KHÔNG được gỡ gian hàng khỏi trạng thái hoạt động. Bản trước đặt
     * tenant về `pending_review`, mà `TENANT_STATUS_PUBLISHABLE` chỉ nhận `active` — nên xin xác
     * minh để mua gói sẽ làm toàn bộ xe của chính mình biến khỏi marketplace trong lúc chờ.
     */
    expect(shop.status).toBe(TENANT_STATUS.ACTIVE);

    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });
    const snapshot = task.snapshot as Record<string, unknown>;
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { displayName: true, email: true, phone: true },
    });
    /*
     * Ba khoá giữ NGUYÊN TÊN: phiếu cũ trong DB mang đúng chúng và màn duyệt vẽ theo khoá.
     * Snapshot là jsonb đông cứng, không migrate.
     */
    expect(snapshot.ownerFullName).toBe(owner.displayName);
    expect(snapshot.ownerPhone).toBe(owner.phone);
    expect(snapshot.ownerEmail).toBe(owner.email);
  });

  maybe('snapshot ĐÔNG CỨNG — chủ đổi tên sau khi gửi không sửa được phiếu đã gửi', async () => {
    const before = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Tên mới sau khi gửi' } });

    const after = await prisma.approvalTask.findFirstOrThrow({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { snapshot: true },
    });
    expect((after.snapshot as Record<string, unknown>).ownerFullName).toBe(
      (before.snapshot as Record<string, unknown>).ownerFullName,
    );

    await prisma.user.update({ where: { id: ownerId }, data: { displayName: 'Chủ shop' } });
  });

  /*
   * 24/09/2026: phiếu xác minh CHỜ không còn khoá hồ sơ. Nền tảng tạm ngừng xác minh gian hàng
   * (màn "Duyệt xe" chỉ nhận phiếu xe), nên một phiếu còn chờ không ai xử lý — giữ khoá là khoá
   * hồ sơ vĩnh viễn mà người dùng không có đường tự gỡ.
   */
  maybe('đang chờ xác minh: hồ sơ VẪN sửa được (không còn khoá vĩnh viễn)', async () => {
    const before = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId },
      select: { displayName: true },
    });

    const shop = await tenants.updateProfile(tenantId, ownerId, {
      displayName: 'Sửa khi đang chờ',
    });
    expect(shop.profile.displayName).toBe('Sửa khi đang chờ');

    await tenants.updateProfile(tenantId, ownerId, {
      displayName: before.displayName ?? undefined,
    });
  });

  maybe('gửi phiếu xác minh thứ hai khi phiếu cũ còn chờ bị chặn', async () => {
    await expect(tenants.submitForReview(tenantId, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SHOP_VERIFICATION_PENDING },
    });
    expect(
      await prisma.approvalTask.count({ where: { tenantId, status: 'pending' } }),
    ).toBe(1);

    // Người duyệt trả về để các test sau chạy trên hồ sơ sửa được.
    await prisma.approvalTask.updateMany({
      where: { tenantId, status: 'pending' },
      data: { status: 'needs_revision', reviewedAt: new Date(), reason: 'Bổ sung giấy tờ.' },
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

/**
 * Cổng thứ hai của `submitForReview`.
 *
 * Trước đây hàm chỉ soi TRẠNG THÁI tenant, nên một hồ sơ trắng trơn vẫn vào được hàng đợi duyệt
 * và reviewer nhận `{}` làm bằng chứng. Nút mờ ở web là gợi ý; chặn thật phải ở đây — và khi
 * chặn thì phải nói ĐÚNG mục nào thiếu, vì đó là thứ web dùng để nhảy tới ô còn trống.
 */
describe('Gửi duyệt đòi hồ sơ đủ thông tin bắt buộc', () => {
  maybe('thiếu SĐT chủ gian hàng → từ chối kèm danh sách mục thiếu, không tạo hồ sơ duyệt', async () => {
    // Thiếu SĐT nghĩa là TÀI KHOẢN CHỦ chưa có số — cổng đọc `users`, không đọc hồ sơ.
    await prisma.user.update({ where: { id: ownerId }, data: { phone: null } });
    const tasksBefore = await prisma.approvalTask.count({ where: { tenantId } });

    await expect(tenants.submitForReview(tenantId, ownerId)).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.PROFILE_INCOMPLETE,
        details: { missing: [SHOP_PROFILE_REQUIREMENT.OWNER_PHONE] },
      },
    });

    // Không nửa vời: gian hàng vẫn hoạt động và hàng đợi duyệt không có gì mới.
    const row = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { status: true },
    });
    expect(row.status).toBe(TENANT_STATUS.ACTIVE);
    expect(await prisma.approvalTask.count({ where: { tenantId } })).toBe(tasksBefore);
  });

  maybe('điền lại đủ → gửi xác minh đi qua', async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { phone: OWNER_PHONE } });
    const shop = await tenants.submitForReview(tenantId, ownerId);

    expect(shop.verification).toBe(SHOP_VERIFICATION.PENDING);
  });
});
