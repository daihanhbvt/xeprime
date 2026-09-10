import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  COLLATERAL_MODE,
  LISTING_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { PlatformApprovalService } from '../src/modules/platform-admin/platform-approval.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePricingService, makePublicListingsService, makeVehiclesService, seedBranch, seedProvince } from './helpers/service-factory';

/**
 * Gap 3 — 4 test bắt buộc ADR 0008 (§Test), chạy qua các service THẬT trên PostgreSQL:
 * (1) khoá tenant → biến khỏi search ngay; (2) sửa giá xe approved → listing hidden + vào hàng chờ;
 * (3) xoá mềm xe → archived + getById cũ 404; (4) duyệt xe → listing active đúng snapshot.
 * Cô lập bằng provinceName duy nhất. Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const listings = new ListingsService(asService);
const vehicles = makeVehiclesService(asService);
const pricing = makePricingService(asService, { listings });
const approvals = new PlatformApprovalService(asService, audit, notifications, listings);
const publicListings = makePublicListingsService(asService);

/**
 * Tỉnh riêng của spec này (mã ngoài danh mục chính thức) — cô lập bằng MÃ, vì bộ lọc marketplace
 * giờ khớp mã chính xác chứ không so tên nữa.
 */
const PROV = 'Z1';
const PROV_NAME = 'Zone Sync';

let dbAvailable = false;
let ownerId: string;
let reviewerId: string;
let tenantId: string;
let branchId: string;
let vApprove: string; // xe cho test duyệt/khoá/sửa
let vDelete: string; // xe cho test xoá mềm

async function seedVehicle(): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      // Vị trí công khai của xe đến từ chi nhánh — snapshot lấy tỉnh ở đây.
      branchId,
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: '51K-123.45',
      description: 'Xe 5 chỗ máy xăng.',
      mainImageUrl: 'https://img.example/vios.jpg',
      // Hồ sơ đủ điều kiện lên chợ theo luật 09/09/2026 (danh tính xe + thông số nguồn năng lượng).
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2022,
      seatCount: 5,
      fuelType: 'gasoline',
      transmission: 'automatic',
      fuelConsumptionCombined: 7.5,
      weekdayPrice: '600000',
      // Field facet mới — snapshot phải mang đủ (assert ở test duyệt xe).
      bodyType: 'sedan',
      hourlyPrice: '90000',
      deliveryEnabled: true,
      discountPercent: 10,
    },
  });
  // Ảnh thư viện: luật 09/09/2026 đòi tối thiểu 4 URL KHÁC NHAU (ảnh đại diện tính là một).
  await prisma.vehicleImage.createMany({
    data: [1, 2, 3].map((n) => ({
      id: newId(),
      tenantId,
      vehicleId: id,
      imageUrl: `https://img.example/listing-${id.slice(-4)}-${n}.jpg`,
      sortOrder: n,
    })),
  });
  await prisma.vehicleFeature.create({
    data: { id: newId(), vehicleId: id, featureKey: 'bluetooth' },
  });
  return id;
}

async function approve(vehicleId: string): Promise<void> {
  await vehicles.submitForPublicReview(tenantId, vehicleId, ownerId);
  const task = await prisma.approvalTask.findFirstOrThrow({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: vehicleId,
      status: APPROVAL_STATUS.PENDING,
    },
    select: { id: true },
  });
  await approvals.approve(task.id, reviewerId);
}

const inSearch = async (vehicleId: string): Promise<boolean> => {
  const res = await publicListings.search({ provinceCode: PROV, limit: 48 } as never);
  return res.data.some((v) => v.id === vehicleId);
};

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
  reviewerId = newId();
  tenantId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: reviewerId, displayName: 'Reviewer', email: `rev-${reviewerId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Sync',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await seedProvince(asService, PROV, PROV_NAME);
  await prisma.tenantProfile.create({
    data: { tenantId, displayName: 'Shop Sync', provinceCode: PROV, provinceName: PROV_NAME },
  });
  branchId = await seedBranch(asService, { tenantId, provinceCode: PROV });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  vApprove = await seedVehicle();
  vDelete = await seedVehicle();
  await approve(vDelete); // arrange sẵn cho test xoá mềm
});

afterAll(async () => {
  if (dbAvailable) {
    // Xoá tenant cascade → vehicles + public_listings + approval_tasks (FK onDelete cascade).
    const tasks = await prisma.approvalTask.findMany({
      where: { tenantId },
      select: { id: true },
    });
    await prisma.approvalLog.deleteMany({
      where: { approvalTaskId: { in: tasks.map((t) => t.id) } },
    });
    await prisma.approvalTask.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { userId: { in: [ownerId, reviewerId] } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.publicListing.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, reviewerId] } } });
    // Tỉnh xoá SAU chi nhánh: FK `ON DELETE RESTRICT` chặn xoá tỉnh còn được tham chiếu.
    await prisma.province.deleteMany({ where: { code: PROV } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('public_listings sync (ADR 0008)', () => {
  maybe(
    'duyệt xe → listing active đúng snapshot (kèm field facet mới) + hiện trên search',
    async () => {
      await approve(vApprove);

      const listing = await prisma.publicListing.findUniqueOrThrow({
        where: { vehicleId: vApprove },
        select: {
          status: true,
          title: true,
          weekdayPrice: true,
          provinceCode: true,
          provinceName: true,
          branchId: true,
          bodyType: true,
          hourlyPrice: true,
          deliveryEnabled: true,
          noCollateral: true,
          discountPercent: true,
          features: true,
          ratingAvg: true,
          ratingCount: true,
        },
      });
      expect(listing.status).toBe(LISTING_STATUS.ACTIVE);
      expect(listing.title).toBe('Toyota Vios');
      expect(String(listing.weekdayPrice)).toBe('600000');
      // Vị trí trên snapshot đến từ CHI NHÁNH: mã để lọc, tên chuẩn để hiển thị.
      expect(listing.branchId).toBe(branchId);
      expect(listing.provinceCode).toBe(PROV);
      expect(listing.provinceName).toBe(PROV_NAME);
      expect(listing.bodyType).toBe('sedan');
      expect(String(listing.hourlyPrice)).toBe('90000');
      expect(listing.deliveryEnabled).toBe(true);
      expect(listing.noCollateral).toBe(false);
      expect(listing.discountPercent).toBe(10);
      expect(listing.features).toEqual(['bluetooth']);
      expect(listing.ratingAvg).toBeNull();
      expect(listing.ratingCount).toBe(0);
      expect(await inSearch(vApprove)).toBe(true);
    },
  );

  maybe('khoá tenant → listing biến khỏi search ngay (không cần job)', async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TENANT_STATUS.SUSPENDED },
    });
    expect(await inSearch(vApprove)).toBe(false);
    // Khôi phục để các test sau chạy tiếp.
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: TENANT_STATUS.ACTIVE } });
    expect(await inSearch(vApprove)).toBe(true);
  });

  /*
   * 09/09/2026 (ghi đè ADR 0008): giá đổi là ÁP DỤNG NGAY ngoài chợ — listing giữ `active`,
   * số mới hiện lên luôn, và không có phiếu duyệt lại nào sinh ra. Đây chính là lý do đổi luật:
   * giá ngoài chợ phải là giá thật, không phải giá của lần duyệt gần nhất.
   */
  maybe('sửa giá xe approved → listing giữ active và mang giá mới ngay', async () => {
    await vehicles.update(tenantId, vApprove, ownerId, { weekdayPrice: '999000' });

    const listing = await prisma.publicListing.findUniqueOrThrow({
      where: { vehicleId: vApprove },
      select: { status: true, weekdayPrice: true },
    });
    expect(listing.status).toBe(LISTING_STATUS.ACTIVE);
    expect(String(listing.weekdayPrice)).toBe('999000');
    expect(await inSearch(vApprove)).toBe(true);
    expect(String((await publicListings.getById(vApprove)).weekdayPrice)).toBe('999000');

    const pending = await prisma.approvalTask.count({
      where: {
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: vApprove,
        status: APPROVAL_STATUS.PENDING,
      },
    });
    expect(pending).toBe(0);
  });

  maybe('sửa CĂN CƯỚC xe approved bị từ chối — listing không đổi', async () => {
    await expect(
      vehicles.update(tenantId, vApprove, ownerId, { plateNumber: '51A-000.11' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await inSearch(vApprove)).toBe(true);
  });

  maybe(
    'giá giờ/% giảm và chính sách gian hàng đổi → listing vẫn active, nhãn đổi theo',
    async () => {
      await vehicles.update(tenantId, vApprove, ownerId, {
        hourlyPrice: '150000',
        discountPercent: 20,
      });
      const stillActive = await prisma.publicListing.findUniqueOrThrow({
        where: { vehicleId: vApprove },
        select: { status: true },
      });
      expect(stillActive.status).toBe(LISTING_STATUS.ACTIVE);

      // Đổi CHÍNH SÁCH gian hàng sang "miễn thế chấp" → nhãn trên sàn đổi theo. Từ 20/08
      // `noCollateral` KHÔNG còn là cờ nhập tay trên xe: nó suy từ chính sách hiệu lực, nên
      // đây mới là đường duy nhất làm nó đổi.
      await pricing.saveShopPolicy(
        tenantId,
        ownerId,
        {
          collateralMode: COLLATERAL_MODE.NONE,
          collateralAssetTypes: [],
          depositAmount: '0',
          deliveryEnabled: false,
          deliveryTiers: [],
          overtimeFeePerHour: null,
          overtimeGraceMinutes: null,
          overtimeRoundingMinutes: null,
          discountEnabled: false,
          discountTiers: [],
        },
        VEHICLE_TYPE.CAR,
      );
      const listing = await prisma.publicListing.findUniqueOrThrow({
        where: { vehicleId: vApprove },
        select: { status: true, noCollateral: true, discountPercent: true },
      });
      expect(listing.status).toBe(LISTING_STATUS.ACTIVE);
      expect(listing.noCollateral).toBe(true);
      expect(listing.discountPercent).toBe(20);
    },
  );

  maybe('xoá mềm xe → listing archived, getById cũ trả 404, không search ra', async () => {
    await vehicles.remove(tenantId, vDelete);

    const listing = await prisma.publicListing.findUniqueOrThrow({
      where: { vehicleId: vDelete },
      select: { status: true },
    });
    expect(listing.status).toBe(LISTING_STATUS.ARCHIVED);
    expect(await inSearch(vDelete)).toBe(false);
    await expect(publicListings.getById(vDelete)).rejects.toThrow();
  });
});
