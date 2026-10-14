import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  LISTING_STATUS,
  MEMBERSHIP_STATUS,
  PERMISSION,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import {
  BRANCH_SCOPED_KEY,
  PERMISSIONS_KEY,
  PLAN_FEATURE_KEY,
  SUBSCRIPTION_TRACK_ONLY_KEY,
  SUPPORT_ACTION_KEY,
} from '../src/common/decorators';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformApprovalService } from '../src/modules/platform-admin/platform-approval.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { VehiclesController } from '../src/modules/vehicles/vehicles.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeNotificationService,
  makePublicListingsService,
  makeVehiclesService,
  seedBranch,
  seedProvince,
} from './helpers/service-factory';
import { TEST_PROVINCE } from './helpers/test-provinces';
import { passVehicleReviewChecks } from './helpers/vehicle-review-fixture';
import { requiredVehicleImageRows } from './helpers/vehicle-media';

/**
 * ADR 0059 — "Có hỗ trợ xuất hoá đơn VAT" theo từng xe.
 *
 * Chạy qua service THẬT trên PostgreSQL thật: điều cần khoá là cờ đi đúng MỘT đường — cột trên
 * `vehicles`, bản sao trên `public_listings` qua writer duy nhất (ADR 0008 §1), cùng transaction
 * với dòng audit — và không lan sang trục nào khác (kiểm duyệt, hiển thị, giá).
 *
 * Cô lập bằng một MÃ TỈNH riêng, cùng cách với `vehicle-marketplace-visibility.spec`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const listings = new ListingsService(asService);
const vehicles = makeVehiclesService(asService, { listings });
const approvals = new PlatformApprovalService(
  asService,
  audit,
  makeNotificationService(asService),
  listings,
);
const publicListings = makePublicListingsService(asService);

const PROV = TEST_PROVINCE.VEHICLE_VAT_INVOICE.code;
const PROV_NAME = TEST_PROVINCE.VEHICLE_VAT_INVOICE.name;

let dbAvailable = false;
let ownerId: string;
let reviewerId: string;
let otherOwnerId: string;
let tenantId: string;
let otherTenantId: string;
let branchId: string;

async function seedVehicle(forTenant = tenantId): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: forTenant,
      branchId,
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `51K-${id.slice(-3)}.45`,
      description: 'Xe 5 chỗ máy xăng.',
      mainImageUrl: `https://img.example/main-${id.slice(-4)}.jpg`,
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2022,
      seatCount: 5,
      fuelType: 'gasoline',
      transmission: 'automatic',
      fuelConsumptionCombined: 7.5,
      bodyType: 'sedan',
      weekdayPrice: '600000',
    },
  });
  await prisma.vehicleImage.createMany({
    data: requiredVehicleImageRows({ vehicleId: id, tenantId: forTenant, vehicleType: VEHICLE_TYPE.CAR }),
  });
  return id;
}

/** Đưa xe qua trọn cổng duyệt THẬT — không ghi tay `approved_public`. */
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
  await passVehicleReviewChecks(prisma, task.id, reviewerId);
  await approvals.approve(task.id, reviewerId);
}

const listingOf = (vehicleId: string) =>
  prisma.publicListing.findUnique({
    where: { vehicleId },
    select: { status: true, vatInvoiceSupported: true },
  });

const vatSearchIds = async (): Promise<string[]> => {
  const res = await publicListings.search({ provinceCode: PROV, vatInvoice: true, limit: 48 } as never);
  return res.data.map((v) => v.id);
};

const vatAudits = (vehicleId: string): Promise<number> =>
  prisma.auditLog.count({
    where: { targetType: 'vehicle', targetId: vehicleId, action: 'vehicle.vat_invoice.update' },
  });

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
  otherOwnerId = newId();
  tenantId = newId();
  otherTenantId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe VAT',
        email: `vat-own-${ownerId}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.PLATFORM,
        id: reviewerId,
        displayName: 'Reviewer',
        email: `vat-rev-${reviewerId}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: otherOwnerId,
        displayName: 'Chủ xe khác',
        email: `vat-own2-${otherOwnerId}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.createMany({
    data: [
      {
        id: tenantId,
        code: `T-${tenantId.slice(-8)}`,
        slug: `t-${tenantId.toLowerCase().slice(-10)}`,
        name: 'Shop VAT',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
      {
        id: otherTenantId,
        code: `T-${otherTenantId.slice(-8)}`,
        slug: `t-${otherTenantId.toLowerCase().slice(-10)}`,
        name: 'Shop VAT Khác',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: otherOwnerId,
      },
    ],
  });
  await seedProvince(asService, PROV, PROV_NAME);
  await prisma.tenantProfile.createMany({
    data: [
      { tenantId, provinceCode: PROV, provinceName: PROV_NAME },
      { tenantId: otherTenantId, provinceCode: PROV, provinceName: PROV_NAME },
    ],
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
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantId, otherTenantId];
    const tasks = await prisma.approvalTask.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true },
    });
    await prisma.approvalLog.deleteMany({
      where: { approvalTaskId: { in: tasks.map((t) => t.id) } },
    });
    await prisma.approvalTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notification.deleteMany({
      where: { userId: { in: [ownerId, reviewerId, otherOwnerId] } },
    });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, reviewerId, otherOwnerId] } } });
    await prisma.province.deleteMany({ where: { code: PROV } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/* ─── Cổng ở controller: quyền + phạm vi, KHÔNG theo tuyến hay phiên hỗ trợ ─────────────── */

describe('ADR 0059 — cổng của PATCH /vehicles/:id/vat-invoice', () => {
  const handler = VehiclesController.prototype.setVatInvoiceSupport;
  const meta = (key: string): unknown => Reflect.getMetadata(key, handler);

  it('đòi `vehicles.update` và khoá theo chi nhánh của xe', () => {
    expect(meta(PERMISSIONS_KEY)).toEqual([PERMISSION.VEHICLE_UPDATE]);
    expect(meta(BRANCH_SCOPED_KEY)).toBeDefined();
  });

  it('áp như nhau cho hai tuyến — không gác theo gói hay cờ tính năng', () => {
    expect(meta(SUBSCRIPTION_TRACK_ONLY_KEY)).toBeUndefined();
    expect(meta(PLAN_FEATURE_KEY)).toBeUndefined();
  });

  it('phiên hỗ trợ của nền tảng không bật/tắt thay chủ xe (mặc định từ chối)', () => {
    expect(meta(SUPPORT_ACTION_KEY)).toBeUndefined();
  });
});

/* ─── Dữ liệu ─────────────────────────────────────────────────────────────── */

describe('ADR 0059 — cờ hoá đơn VAT theo từng xe', () => {
  maybe('xe mới mặc định KHÔNG hỗ trợ — không ai được suy ra một cam kết chưa có', async () => {
    const v = await seedVehicle();
    const detail = await vehicles.getOne(tenantId, v);
    expect(detail.vatInvoiceSupported).toBe(false);
  });

  maybe('xe đang trên chợ: bật → nguồn, snapshot, tìm kiếm và chi tiết công khai cùng đổi', async () => {
    const v = await seedVehicle();
    await approve(v);
    expect(await listingOf(v)).toEqual({ status: LISTING_STATUS.ACTIVE, vatInvoiceSupported: false });
    expect(await vatSearchIds()).not.toContain(v);

    const res = await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true);

    expect(res.vatInvoiceSupported).toBe(true);
    expect(await listingOf(v)).toEqual({ status: LISTING_STATUS.ACTIVE, vatInvoiceSupported: true });
    expect(await vatSearchIds()).toContain(v);
    expect((await publicListings.getById(v)).vatInvoiceSupported).toBe(true);
    expect(await vatAudits(v)).toBe(1);

    // Tắt lại → rời bộ lọc, nhưng xe VẪN ở chợ: cờ này không phải công tắc hiển thị.
    await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, false);
    expect(await listingOf(v)).toEqual({ status: LISTING_STATUS.ACTIVE, vatInvoiceSupported: false });
    expect(await vatSearchIds()).not.toContain(v);
    expect(await vatAudits(v)).toBe(2);
  });

  maybe('không chạm trục nào khác: kiểm duyệt, hiển thị, giá giữ nguyên', async () => {
    const v = await seedVehicle();
    await approve(v);
    const before = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v },
      select: { publicStatus: true, marketplaceEnabled: true, operationStatus: true, weekdayPrice: true },
    });

    await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true);

    const after = await prisma.vehicle.findUniqueOrThrow({
      where: { id: v },
      select: { publicStatus: true, marketplaceEnabled: true, operationStatus: true, weekdayPrice: true },
    });
    expect(after).toEqual(before);
    expect(after.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
  });

  maybe('gửi lại đúng giá trị đang có là no-op — một dòng audit cho một lần đổi thật', async () => {
    const v = await seedVehicle();
    await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true);
    await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true);
    expect(await vatAudits(v)).toBe(1);
  });

  maybe('hai lượt bấm song song cùng đích: chỉ một lượt ghi', async () => {
    const v = await seedVehicle();
    await Promise.all([
      vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true),
      vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true),
    ]);
    expect(await vatAudits(v)).toBe(1);
    expect((await vehicles.getOne(tenantId, v)).vatInvoiceSupported).toBe(true);
  });

  maybe('xe NHÁP chưa có listing: lưu được, không đẻ ra listing ma; lên chợ thì mang theo cờ', async () => {
    const v = await seedVehicle();
    await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true);
    expect(await listingOf(v)).toBeNull();

    await approve(v);
    expect(await listingOf(v)).toEqual({ status: LISTING_STATUS.ACTIVE, vatInvoiceSupported: true });
    expect(await vatSearchIds()).toContain(v);
  });

  maybe('chủ xe đang tạm ẩn: không lộ ra chợ; bật hiển thị lại thì snapshot mang cờ mới', async () => {
    const v = await seedVehicle();
    await approve(v);
    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, false);

    await vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true);
    expect((await listingOf(v))?.status).toBe(LISTING_STATUS.HIDDEN);
    expect(await vatSearchIds()).not.toContain(v);

    await vehicles.setMarketplaceVisibility(tenantId, v, ownerId, true);
    expect(await listingOf(v)).toEqual({ status: LISTING_STATUS.ACTIVE, vatInvoiceSupported: true });
  });

  maybe('xe của gian hàng khác hoặc đã xoá: NOT_FOUND, không ghi gì', async () => {
    const v = await seedVehicle();
    await expect(vehicles.setVatInvoiceSupport(otherTenantId, v, otherOwnerId, true)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    expect((await vehicles.getOne(tenantId, v)).vatInvoiceSupported).toBe(false);

    await prisma.vehicle.update({ where: { id: v }, data: { deletedAt: new Date() } });
    await expect(vehicles.setVatInvoiceSupport(tenantId, v, ownerId, true)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    expect(await vatAudits(v)).toBe(0);
  });
});
