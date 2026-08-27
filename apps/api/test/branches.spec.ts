import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS,
  BRANCH_STATUS,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { BranchesService } from '../src/modules/branches/branches.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBranchesService,
  makeProvincesService,
  makeVehiclesService,
  vehicleCreator,
} from './helpers/service-factory';

/**
 * Chi nhánh gian hàng — chạy trên PostgreSQL THẬT.
 *
 * Điều được khoá ở đây là các bất biến mà nếu hỏng thì hỏng ÂM THẦM: chi nhánh của gian hàng
 * khác phải là 404 (không phải 403 — 403 là đã xác nhận nó tồn tại); mỗi gian hàng đúng một
 * chi nhánh mặc định; xe không gắn được vào chi nhánh đã ngừng; và đổi tỉnh của chi nhánh phải
 * kéo theo vị trí công khai của mọi xe trong đó.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const branches: BranchesService = makeBranchesService(asService);
const vehicles = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehicles, asService);
const listings = new ListingsService(asService);
const tenants = new TenantsService(
  asService,
  new AuditService(asService),
  makeProvincesService(asService),
  branches,
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let defaultBranchId: string;

/** Hai tỉnh chính thức có sẵn sau migration — spec không phải dựng dữ liệu tham chiếu. */
const HCM = '79';
const DANANG = '48';

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
  otherTenantId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  for (const id of [tenantId, otherTenantId]) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: 'Shop Branch',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
    await prisma.tenantProfile.create({ data: { tenantId: id, displayName: 'Shop Branch' } });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: ownerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }

  const created = await branches.create(tenantId, ownerId, {
    name: 'Chi nhánh gốc',
    provinceCode: HCM,
  });
  defaultBranchId = created.id;
});

afterAll(async () => {
  if (dbAvailable) {
    const ids = [tenantId, otherTenantId];
    await prisma.booking.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Tạo & bất biến mặc định', () => {
  maybe('chi nhánh đầu tiên tự thành mặc định, mã sinh ở server', async () => {
    const list = await branches.list(tenantId, {});
    const root = list.items.find((b) => b.id === defaultBranchId);
    expect(root?.isDefault).toBe(true);
    expect(root?.code).toBe('CN01');
    expect(root?.provinceCode).toBe(HCM);
    expect(root?.provinceName).toBe('Hồ Chí Minh');
  });

  maybe('chi nhánh thứ hai KHÔNG tự thành mặc định và nhận mã kế tiếp', async () => {
    const second = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh Đà Nẵng',
      provinceCode: DANANG,
    });
    expect(second.isDefault).toBe(false);
    expect(second.code).toBe('CN02');
    await prisma.tenantBranch.delete({ where: { id: second.id } });
  });

  maybe('DB chặn hai chi nhánh mặc định cùng lúc (partial unique index)', async () => {
    const rogue = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh lậu',
      provinceCode: DANANG,
    });
    await expect(
      prisma.tenantBranch.update({ where: { id: rogue.id }, data: { isDefault: true } }),
    ).rejects.toThrow();
    await prisma.tenantBranch.delete({ where: { id: rogue.id } });
  });

  maybe('mã tỉnh không tồn tại / đã tắt đều bị từ chối', async () => {
    await expect(
      branches.create(tenantId, ownerId, { name: 'X', provinceCode: 'ZZ' }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    await prisma.province.update({ where: { code: DANANG }, data: { isEnabled: false } });
    try {
      await expect(
        branches.create(tenantId, ownerId, { name: 'X', provinceCode: DANANG }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    } finally {
      await prisma.province.update({ where: { code: DANANG }, data: { isEnabled: true } });
    }
  });
});

describe('Cô lập giữa các gian hàng', () => {
  maybe('id chi nhánh của gian hàng khác trả 404, không phải 403', async () => {
    await expect(branches.get(otherTenantId, defaultBranchId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(
      branches.update(otherTenantId, defaultBranchId, ownerId, { name: 'Đổi trộm' }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
    await expect(branches.setDefault(otherTenantId, defaultBranchId, ownerId)).rejects.toMatchObject(
      { response: { code: API_ERROR_CODE.NOT_FOUND } },
    );
  });

  maybe('không gắn được xe vào chi nhánh của gian hàng khác', async () => {
    const foreign = await branches.create(otherTenantId, ownerId, {
      name: 'Chi nhánh shop khác',
      provinceCode: HCM,
    });
    await expect(
      vehicles.create(tenantId, ownerId, {
        name: 'Xe lậu',
        vehicleType: VEHICLE_TYPE.CAR,
        branchId: foreign.id,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });
    await prisma.tenantBranch.delete({ where: { id: foreign.id } });
  });

  maybe('danh sách chỉ trả chi nhánh của gian hàng hiện tại', async () => {
    const mine = await branches.list(tenantId, {});
    const theirs = await branches.list(otherTenantId, {});
    expect(mine.items.some((b) => b.id === defaultBranchId)).toBe(true);
    expect(theirs.items.some((b) => b.id === defaultBranchId)).toBe(false);
  });
});

describe('Vòng đời chi nhánh', () => {
  maybe('chi nhánh ngừng hoạt động KHÔNG nhận xe mới', async () => {
    const b = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh sắp đóng',
      provinceCode: DANANG,
    });
    await branches.deactivate(tenantId, b.id, ownerId);

    await expect(
      vehicles.create(tenantId, ownerId, {
        name: 'Xe mới',
        vehicleType: VEHICLE_TYPE.CAR,
        branchId: b.id,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    await branches.activate(tenantId, b.id, ownerId);
    await prisma.tenantBranch.delete({ where: { id: b.id } });
  });

  maybe('không ngừng được chi nhánh MẶC ĐỊNH', async () => {
    await expect(branches.deactivate(tenantId, defaultBranchId, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.BRANCH_DEFAULT_IMMUTABLE },
    });
  });

  maybe('còn xe hoặc đơn đang chạy → chặn ngừng, kèm con số phải xử lý', async () => {
    const b = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh có xe',
      provinceCode: DANANG,
    });
    const v = await vehicles.create(tenantId, ownerId, {
      name: 'Xe ở chi nhánh',
      vehicleType: VEHICLE_TYPE.CAR,
      branchId: b.id,
    });

    await expect(branches.deactivate(tenantId, b.id, ownerId)).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.BRANCH_HAS_DEPENDENCIES,
        details: { vehicleCount: 1, activeBookings: 0 },
      },
    });

    // Đơn đang chạy cũng phải được đếm — không dời xe hộ, cũng không ngừng lén.
    await prisma.booking.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: v.id,
        code: `BK-${newId().slice(-6)}`,
        customerName: 'Khách',
        customerPhone: '0900000001',
        status: BOOKING_STATUS.ACTIVE,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: new Date('2027-01-01T02:00:00.000Z'),
        returnAt: new Date('2027-01-03T02:00:00.000Z'),
        baseAmount: '0',
        totalAmount: '0',
        paidAmount: '0',
      },
    });
    await expect(branches.deactivate(tenantId, b.id, ownerId)).rejects.toMatchObject({
      response: { details: { vehicleCount: 1, activeBookings: 1 } },
    });

    await prisma.booking.deleteMany({ where: { vehicleId: v.id } });
    await prisma.publicListing.deleteMany({ where: { vehicleId: v.id } });
    await prisma.vehicle.delete({ where: { id: v.id } });
    await prisma.tenantBranch.delete({ where: { id: b.id } });
  });

  maybe('chi nhánh còn xe KHÔNG xoá cứng được — FK chặn ở DB', async () => {
    const b = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh khoá FK',
      provinceCode: DANANG,
    });
    const v = await vehicles.create(tenantId, ownerId, {
      name: 'Xe giữ chi nhánh',
      vehicleType: VEHICLE_TYPE.CAR,
      branchId: b.id,
    });

    await expect(prisma.tenantBranch.delete({ where: { id: b.id } })).rejects.toThrow();

    await prisma.publicListing.deleteMany({ where: { vehicleId: v.id } });
    await prisma.vehicle.delete({ where: { id: v.id } });
    await prisma.tenantBranch.delete({ where: { id: b.id } });
  });

  maybe('đổi mặc định: cờ cũ hạ xuống và hồ sơ gian hàng đồng bộ theo', async () => {
    const b = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh Đà Nẵng',
      provinceCode: DANANG,
    });
    await branches.setDefault(tenantId, b.id, ownerId);

    const rows = await prisma.tenantBranch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, isDefault: true },
    });
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.id).toBe(b.id);

    const profile = await prisma.tenantProfile.findUniqueOrThrow({ where: { tenantId } });
    expect(profile.provinceCode).toBe(DANANG);
    expect(profile.provinceName).toBe('Đà Nẵng');

    // Trả lại mặc định cho các test sau.
    await branches.setDefault(tenantId, defaultBranchId, ownerId);
    await prisma.tenantBranch.delete({ where: { id: b.id } });
  });
});

describe('Vị trí công khai bám theo chi nhánh', () => {
  maybe('snapshot lấy tỉnh từ chi nhánh của xe, không từ hồ sơ gian hàng', async () => {
    const danang = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh Đà Nẵng',
      provinceCode: DANANG,
    });
    const v = await createVehicle(tenantId, ownerId, {
      name: 'Xe Đà Nẵng',
      vehicleType: VEHICLE_TYPE.CAR,
    });
    await vehicles.update(tenantId, v.id, ownerId, { branchId: danang.id });
    // Snapshot chỉ tồn tại khi xe đã công khai — đặt trạng thái rồi sync như đường duyệt thật.
    await prisma.vehicle.update({
      where: { id: v.id },
      data: { publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC },
    });
    await listings.syncFromVehicle(v.id);

    const listing = await prisma.publicListing.findUnique({
      where: { vehicleId: v.id },
      select: { branchId: true, provinceCode: true, provinceName: true },
    });
    expect(listing?.branchId).toBe(danang.id);
    expect(listing?.provinceCode).toBe(DANANG);
    expect(listing?.provinceName).toBe('Đà Nẵng');

    // Đổi tỉnh của chi nhánh → mọi snapshot trong đó đổi theo NGAY, không đợi sửa từng xe.
    await branches.update(tenantId, danang.id, ownerId, { provinceCode: HCM });
    const after = await prisma.publicListing.findUnique({
      where: { vehicleId: v.id },
      select: { provinceCode: true, provinceName: true },
    });
    expect(after?.provinceCode).toBe(HCM);
    expect(after?.provinceName).toBe('Hồ Chí Minh');

    await prisma.publicListing.deleteMany({ where: { vehicleId: v.id } });
    await prisma.vehicle.delete({ where: { id: v.id } });
    await prisma.tenantBranch.delete({ where: { id: danang.id } });
  });

  maybe('chuyển xe sang chi nhánh khác được ghi audit', async () => {
    const b = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh audit',
      provinceCode: DANANG,
    });
    const v = await createVehicle(tenantId, ownerId, {
      name: 'Xe audit',
      vehicleType: VEHICLE_TYPE.CAR,
    });
    await vehicles.update(tenantId, v.id, ownerId, { branchId: b.id });

    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'vehicle.branch.reassign', targetId: v.id },
    });
    expect(log).not.toBeNull();

    await prisma.publicListing.deleteMany({ where: { vehicleId: v.id } });
    await prisma.vehicle.delete({ where: { id: v.id } });
    await prisma.tenantBranch.delete({ where: { id: b.id } });
  });
});

describe('Đăng ký gian hàng tạo chi nhánh mặc định', () => {
  maybe('một transaction: tenant + membership + hồ sơ + chi nhánh mặc định', async () => {
    const userId = newId();
    await prisma.user.create({
      data: { id: userId, displayName: 'Chủ mới', email: `new-${userId}@xeprime.test` },
    });

    const shop = await tenants.registerShop(userId, {
      name: 'Gian hàng mới',
      provinceCode: DANANG,
      address: '12 Bạch Đằng',
    });

    expect(shop.defaultBranch?.provinceCode).toBe(DANANG);
    expect(shop.defaultBranch?.name).toBe('Chi nhánh Đà Nẵng');
    expect(shop.profile.provinceCode).toBe(DANANG);

    const rows = await prisma.tenantBranch.findMany({ where: { tenantId: shop.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isDefault).toBe(true);
    expect(rows[0]?.address).toBe('12 Bạch Đằng');

    await prisma.tenantBranch.deleteMany({ where: { tenantId: shop.id } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: shop.id } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: shop.id } });
    await prisma.tenant.delete({ where: { id: shop.id } });
    await prisma.user.delete({ where: { id: userId } });
  });

  maybe('tỉnh không hợp lệ → KHÔNG tạo gian hàng nào (rollback sạch)', async () => {
    const userId = newId();
    await prisma.user.create({
      data: { id: userId, displayName: 'Chủ lỗi', email: `bad-${userId}@xeprime.test` },
    });

    await expect(
      tenants.registerShop(userId, { name: 'Gian hàng lỗi', provinceCode: 'ZZ' }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });

    const created = await prisma.tenant.count({ where: { ownerUserId: userId } });
    expect(created).toBe(0);

    await prisma.user.delete({ where: { id: userId } });
  });
});

describe('Bộ lọc chi nhánh ở danh sách xe', () => {
  maybe('lọc theo branchId chỉ thu hẹp trong gian hàng, không vượt tenant', async () => {
    const b = await branches.create(tenantId, ownerId, {
      name: 'Chi nhánh lọc',
      provinceCode: DANANG,
    });
    const inBranch = await vehicles.create(tenantId, ownerId, {
      name: 'Xe trong chi nhánh',
      vehicleType: VEHICLE_TYPE.CAR,
      branchId: b.id,
    });
    const inDefault = await createVehicle(tenantId, ownerId, {
      name: 'Xe chi nhánh mặc định',
      vehicleType: VEHICLE_TYPE.CAR,
    });

    const filtered = await vehicles.list(tenantId, { branchId: b.id, limit: 50 });
    const ids = filtered.data.map((v) => v.id);
    expect(ids).toContain(inBranch.id);
    expect(ids).not.toContain(inDefault.id);
    expect(filtered.data.every((v) => v.branch?.id === b.id)).toBe(true);

    // Chi nhánh của gian hàng KHÁC lọt vào tham số cũng chỉ ra rỗng, không lộ dữ liệu.
    const foreign = await branches.create(otherTenantId, ownerId, {
      name: 'Chi nhánh ngoài',
      provinceCode: HCM,
    });
    const leaked = await vehicles.list(tenantId, { branchId: foreign.id, limit: 50 });
    expect(leaked.data).toHaveLength(0);

    const counts = await branches.list(tenantId, {});
    expect(counts.items.find((x) => x.id === b.id)?.vehicleCount).toBe(1);

    await prisma.publicListing.deleteMany({
      where: { vehicleId: { in: [inBranch.id, inDefault.id] } },
    });
    await prisma.vehicle.deleteMany({ where: { id: { in: [inBranch.id, inDefault.id] } } });
    await prisma.tenantBranch.deleteMany({ where: { id: { in: [b.id, foreign.id] } } });
  });
});

describe('Chi nhánh phải có tỉnh mới lên chợ được', () => {
  maybe('chi nhánh thiếu tỉnh → chặn gửi duyệt công khai kèm mã lỗi rõ', async () => {
    // Mô phỏng chi nhánh do MIGRATION sinh ra mà không quy được tỉnh.
    const legacyId = newId();
    await prisma.tenantBranch.create({
      data: {
        id: legacyId,
        tenantId,
        code: `CN-LEGACY-${legacyId.slice(-4)}`,
        name: 'Chi nhánh chính',
        provinceCode: null,
        needsLocationReview: true,
        legacyProvinceValue: 'Vientiane',
        status: BRANCH_STATUS.ACTIVE,
      },
    });
    const v = await vehicles.create(tenantId, ownerId, {
      name: 'Xe chưa có tỉnh',
      vehicleType: VEHICLE_TYPE.CAR,
      branchId: legacyId,
      plateNumber: '51A-999.99',
      weekdayPrice: '500000',
      mainImageUrl: 'https://img.example/x.jpg',
      description: 'Xe 5 chỗ máy xăng, đầy đủ giấy tờ.',
    });

    await expect(vehicles.submitForPublicReview(tenantId, v.id, ownerId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.BRANCH_LOCATION_REQUIRED },
    });

    // Bổ sung tỉnh → cờ rà soát tắt và xe gửi duyệt được.
    const fixed = await branches.update(tenantId, legacyId, ownerId, { provinceCode: HCM });
    expect(fixed.needsLocationReview).toBe(false);
    await expect(vehicles.submitForPublicReview(tenantId, v.id, ownerId)).resolves.toBeTruthy();

    const tasks = await prisma.approvalTask.findMany({
      where: { targetId: v.id },
      select: { id: true },
    });
    await prisma.approvalLog.deleteMany({
      where: { approvalTaskId: { in: tasks.map((t) => t.id) } },
    });
    await prisma.approvalTask.deleteMany({ where: { targetId: v.id } });
    await prisma.publicListing.deleteMany({ where: { vehicleId: v.id } });
    await prisma.vehicle.delete({ where: { id: v.id } });
    await prisma.tenantBranch.delete({ where: { id: legacyId } });
  });
});
