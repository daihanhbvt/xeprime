import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  APPROVAL_ACTION,
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  BILLING_MODE,
  COLLATERAL_MODE,
  FUEL_TYPE,
  INSURANCE_ELIGIBILITY_GAP,
  LISTING_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  POLICY_SOURCE,
  SERVICE_TYPE,
  STOREFRONT_KIND,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_REVIEW_BASIS,
  VEHICLE_REVIEW_CHECK,
  VEHICLE_REVIEW_CHECK_VALUES,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_TYPE,
  type AccountRealm,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformApprovalService } from '../src/modules/platform-admin/platform-approval.service';
import { PlatformVehicleApprovalService } from '../src/modules/platform-admin/platform-vehicle-approval.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  giveShopStorefront,
  makeNotificationService,
  makePricingService,
  makeVehicleInsuranceReviewService,
  makeVehiclesService,
  seedBranch,
} from './helpers/service-factory';
import { passVehicleReviewChecks } from './helpers/vehicle-review-fixture';
import { requiredVehicleImageRows } from './helpers/vehicle-media';

/**
 * Màn "DUYỆT XE" của nền tảng (24/09/2026) trên PostgreSQL THẬT.
 *
 * Khoá năm điều mà màn hình dựa vào và không điều nào kiểm được bằng mock:
 *
 *  1. Hàng đợi CHỈ có phiếu xe, và mọi bộ lọc (loại xe, nguồn đăng, tìm, trạng thái) áp ở DB
 *     trước khi đếm và phân trang; số trên tab đến từ cùng lần đọc.
 *  2. Snapshot v2 chụp ĐỦ thứ khách thấy ngoài chợ lúc gửi — và không đổi khi xe sống đổi.
 *  3. Danh mục kiểm tra thủ công được lưu phía server, và phê duyệt bị BACKEND chặn khi thiếu.
 *  4. Hai người duyệt đua nhau không tạo ra hai quyết định; bỏ đánh dấu không lọt vào giữa lượt
 *     phê duyệt.
 *  5. Mỗi quyết định đổi phiếu + xe + listing + audit + thông báo trong MỘT transaction.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test platform-vehicle-approvals
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const listings = new ListingsService(asService);
const vehicles = makeVehiclesService(asService);
const approvals = new PlatformApprovalService(asService, audit, notifications, listings);
const vehicleApprovals = new PlatformVehicleApprovalService(
  asService,
  audit,
  makePricingService(asService),
  approvals,
  makeVehicleInsuranceReviewService(asService),
);

/** Mã chạy — mọi tên/mã xe mang nó để `q` khoanh đúng dữ liệu của spec này trên DB dùng chung. */
const RUN = `VA${Date.now().toString(36).toUpperCase()}`;

let dbAvailable = false;
let shopOwnerId: string;
let shopStaffId: string;
let personalOwnerId: string;
let reviewerA: string;
let reviewerB: string;
let shopTenantId: string;
let personalTenantId: string;
const branchByTenant = new Map<string, string>();

/** Xe của spec — id theo vai. */
const ids = {
  shopCar: '',
  personalBike: '',
  personalEv: '',
  legacy: '',
};
let tenantTaskId: string;

async function seedVehicle(tenant: string, overrides: Record<string, unknown>): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: tenant,
      branchId: branchByTenant.get(tenant),
      code: `${RUN}-${id.slice(-5)}`,
      name: `Toyota Vios ${RUN}`,
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `75A-${id.slice(-3)}.45`,
      // Ảnh BÌA = ảnh MẶT TRƯỚC (07/10/2026) — fixture seed thẳng bằng Prisma nên phải tự khớp.
      mainImageUrl: `https://img.example/${id.slice(-6)}-front.jpg`,
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2023,
      color: 'Trắng',
      seatCount: 5,
      fuelType: FUEL_TYPE.GASOLINE,
      transmission: 'automatic',
      fuelConsumptionCombined: 6.2,
      weekdayPrice: '700000',
      discountPercent: 10,
      description: 'Xe gia đình, nội thất sạch.',
      ...overrides,
    },
  });
  // Đủ GÓC ảnh bắt buộc của loại xe (07/10/2026) — ba dòng không gán góc sẽ bị cổng duyệt
  // báo thiếu `photos`, ở những ca chẳng nói gì về ảnh.
  await prisma.vehicleImage.createMany({
    data: requiredVehicleImageRows({
      vehicleId: id,
      tenantId: tenant,
      vehicleType: String(overrides.vehicleType ?? VEHICLE_TYPE.CAR),
    }),
  });
  return id;
}

async function pendingTaskOf(vehicleId: string): Promise<string> {
  const task = await prisma.approvalTask.findFirstOrThrow({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: vehicleId,
      status: APPROVAL_STATUS.PENDING,
    },
    select: { id: true },
  });
  return task.id;
}

async function makeUser(name: string, realm: AccountRealm): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, realm, displayName: name, email: `${id.toLowerCase()}@xeprime.test` },
  });
  return id;
}

async function makeTenant(name: string, ownerUserId: string): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-8)}`,
      name,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId,
    },
  });
  return id;
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  shopOwnerId = await makeUser('Chủ Huế Rental', ACCOUNT_REALM.PARTNER);
  shopStaffId = await makeUser('Nguyễn Văn Minh', ACCOUNT_REALM.PARTNER);
  personalOwnerId = await makeUser('Trần Văn Nam', ACCOUNT_REALM.PARTNER);
  reviewerA = await makeUser('Reviewer A', ACCOUNT_REALM.PLATFORM);
  reviewerB = await makeUser('Reviewer B', ACCOUNT_REALM.PLATFORM);

  shopTenantId = await makeTenant(`Huế Rental ${RUN}`, shopOwnerId);
  personalTenantId = await makeTenant(`Trần Văn Nam ${RUN}`, personalOwnerId);
  await giveTenantPlan(prisma, shopTenantId, { billingMode: BILLING_MODE.PACKAGE });
  await giveTenantPlan(prisma, personalTenantId, { billingMode: BILLING_MODE.COMMISSION });
  await prisma.tenantMembership.createMany({
    data: [
      {
        id: newId(),
        tenantId: shopTenantId,
        userId: shopOwnerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId: shopTenantId,
        userId: shopStaffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
      {
        id: newId(),
        tenantId: personalTenantId,
        userId: personalOwnerId,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    ],
  });
  for (const t of [shopTenantId, personalTenantId]) {
    branchByTenant.set(
      t,
      await seedBranch(asService, { tenantId: t, addressLine: '25 Hùng Vương' }),
    );
    await giveShopStorefront(asService, t);
  }

  // ── Ô tô của GIAN HÀNG: chính sách giao xe + giới hạn km + tự nhận + điều khoản + tiện nghi.
  ids.shopCar = await seedVehicle(shopTenantId, {});
  await prisma.rentalPolicy.create({
    data: {
      id: newId(),
      tenantId: shopTenantId,
      vehicleId: ids.shopCar,
      collateralMode: COLLATERAL_MODE.NONE,
      depositAmount: 0,
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 30,
      deliveryTiers: [
        { toKm: 5, fee: '0' },
        { toKm: 30, fee: '150000' },
      ],
      includedDistanceKmPerDay: 300,
      excessDistanceFeePerKm: 3000,
    },
  });
  await prisma.vehicleServiceSetting.create({
    data: {
      id: newId(),
      tenantId: shopTenantId,
      vehicleId: ids.shopCar,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      autoAcceptEnabled: true,
      termsText: 'Xuất trình giấy phép lái xe khi nhận xe',
    },
  });
  await prisma.vehicleFeature.createMany({
    data: ['bluetooth', 'camera_reverse'].map((featureKey) => ({
      id: newId(),
      vehicleId: ids.shopCar,
      featureKey,
    })),
  });

  // ── Xe máy của CÁ NHÂN: phân khúc + dung tích, KHÔNG số chỗ.
  ids.personalBike = await seedVehicle(personalTenantId, {
    name: `Yamaha Exciter ${RUN}`,
    vehicleType: VEHICLE_TYPE.MOTORBIKE,
    brand: 'yamaha',
    model: 'Exciter 155',
    seatCount: null,
    motorbikeCategory: 'underbone',
    transmission: 'manual_clutch',
    fuelConsumptionCombined: null,
    engineDisplacementCc: 155,
    weekdayPrice: '180000',
    discountPercent: null,
  });

  // ── Ô tô ĐIỆN của cá nhân — dùng cho nhánh yêu cầu bổ sung / từ chối.
  ids.personalEv = await seedVehicle(personalTenantId, {
    name: `VinFast VF5 ${RUN}`,
    brand: 'vinfast',
    model: 'VF5',
    fuelType: FUEL_TYPE.ELECTRIC,
    transmission: null,
    fuelConsumptionCombined: null,
    electricRangeKm: 326,
    batteryCapacityKwh: 37.23,
  });

  // Người GỬI của xe gian hàng là NHÂN VIÊN — khác chủ xe, và màn duyệt phải nói ra điều đó.
  await vehicles.submitForPublicReview(shopTenantId, ids.shopCar, shopStaffId);
  await vehicles.submitForPublicReview(personalTenantId, ids.personalBike, personalOwnerId);
  await vehicles.submitForPublicReview(personalTenantId, ids.personalEv, personalOwnerId);

  // Phiếu XÁC MINH GIAN HÀNG cùng tenant — tuyệt đối không được lọt vào màn duyệt xe.
  tenantTaskId = newId();
  await prisma.approvalTask.create({
    data: {
      id: tenantTaskId,
      tenantId: shopTenantId,
      targetType: APPROVAL_TARGET_TYPE.TENANT,
      targetId: shopTenantId,
      status: APPROVAL_STATUS.PENDING,
      submittedBy: shopOwnerId,
    },
  });

  // Phiếu CŨ (trước snapshot v2): có hình chiếu hàng đợi nhưng KHÔNG có snapshot.
  ids.legacy = await seedVehicle(personalTenantId, { name: `Kia Morning ${RUN}` });
  const legacyTaskId = newId();
  await prisma.approvalTask.create({
    data: {
      id: legacyTaskId,
      tenantId: personalTenantId,
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: ids.legacy,
      status: APPROVAL_STATUS.APPROVED,
      submittedBy: personalOwnerId,
      submittedAt: new Date(Date.now() - 10 * 86_400_000),
      reviewedAt: new Date(Date.now() - 9 * 86_400_000),
    },
  });
  await prisma.approvalVehicleSubject.create({
    data: {
      approvalTaskId: legacyTaskId,
      vehicleId: ids.legacy,
      vehicleType: VEHICLE_TYPE.CAR,
      name: `Kia Morning ${RUN}`,
      code: `${RUN}-LEGACY`,
      storefrontKind: STOREFRONT_KIND.PERSONAL,
      sourceName: `Trần Văn Nam ${RUN}`,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [shopTenantId, personalTenantId];
    const users = [shopOwnerId, shopStaffId, personalOwnerId, reviewerA, reviewerB];
    // `approval_tasks` cascade xuống log · hình chiếu · danh mục kiểm tra.
    await prisma.approvalTask.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rentalPolicy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('1. Hàng đợi: chỉ phiếu xe, lọc + đếm + phân trang ở DB', () => {
  maybe('không bao giờ có phiếu gian hàng — kể cả khi cùng tenant, cùng trạng thái', async () => {
    const page = await vehicleApprovals.list({ status: APPROVAL_STATUS.PENDING, q: RUN });
    expect(page.data.map((row) => row.approvalTaskId)).not.toContain(tenantTaskId);
    expect(page.data).toHaveLength(3);
    for (const row of page.data) {
      expect([VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE]).toContain(row.vehicleType);
    }
    // Id của phiếu gian hàng gửi vào route xe là 404, không phải một hồ sơ gian hàng.
    await expect(vehicleApprovals.detail(tenantTaskId)).rejects.toMatchObject({ status: 404 });
  });

  maybe('tab loại xe lọc ở DB; số trên tab không phụ thuộc tab đang chọn', async () => {
    const bikes = await vehicleApprovals.list({
      status: APPROVAL_STATUS.PENDING,
      q: RUN,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
    });
    expect(bikes.data.map((r) => r.vehicleId)).toEqual([ids.personalBike]);
    expect(bikes.meta.total).toBe(1);
    expect(bikes.counts).toEqual({ all: 3, car: 2, motorbike: 1 });

    const cars = await vehicleApprovals.list({
      status: APPROVAL_STATUS.PENDING,
      q: RUN,
      vehicleType: VEHICLE_TYPE.CAR,
    });
    expect(cars.meta.total).toBe(2);
    expect(cars.counts).toEqual(bikes.counts);
  });

  maybe('nguồn đăng suy từ TUYẾN (gói ⇒ gian hàng, hoa hồng ⇒ cá nhân)', async () => {
    const shop = await vehicleApprovals.list({
      status: APPROVAL_STATUS.PENDING,
      q: RUN,
      storefrontKind: STOREFRONT_KIND.SHOP,
    });
    expect(shop.data.map((r) => r.vehicleId)).toEqual([ids.shopCar]);
    expect(shop.data[0]!.sourceName).toBe(`Huế Rental ${RUN}`);
    // Đếm theo tab tôn trọng bộ lọc nguồn đăng.
    expect(shop.counts).toEqual({ all: 1, car: 1, motorbike: 0 });

    const personal = await vehicleApprovals.list({
      status: APPROVAL_STATUS.PENDING,
      q: RUN,
      storefrontKind: STOREFRONT_KIND.PERSONAL,
    });
    expect(new Set(personal.data.map((r) => r.vehicleId))).toEqual(
      new Set([ids.personalBike, ids.personalEv]),
    );
  });

  maybe('tìm theo tên, mã và biển số — không phân biệt hoa thường', async () => {
    const plate = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.personalBike },
      select: { plateNumber: true, code: true },
    });
    const byPlate = await vehicleApprovals.list({ q: plate.plateNumber!.toLowerCase() });
    expect(byPlate.data.map((r) => r.vehicleId)).toContain(ids.personalBike);

    const byCode = await vehicleApprovals.list({ q: plate.code });
    expect(byCode.data.map((r) => r.vehicleId)).toEqual([ids.personalBike]);

    const byName = await vehicleApprovals.list({ q: `yamaha exciter ${RUN.toLowerCase()}` });
    expect(byName.data.map((r) => r.vehicleId)).toEqual([ids.personalBike]);
  });

  maybe('phân trang sau khi lọc; hàng chờ cũ nhất đứng trước', async () => {
    const first = await vehicleApprovals.list({
      status: APPROVAL_STATUS.PENDING,
      q: RUN,
      limit: 2,
    });
    expect(first.meta).toMatchObject({ page: 1, limit: 2, total: 3, hasNext: true });
    expect(first.data.map((r) => r.vehicleId)).toEqual([ids.shopCar, ids.personalBike]);

    const second = await vehicleApprovals.list({
      status: APPROVAL_STATUS.PENDING,
      q: RUN,
      limit: 2,
      page: 2,
    });
    expect(second.meta).toMatchObject({ page: 2, total: 3, hasNext: false });
    expect(second.data.map((r) => r.vehicleId)).toEqual([ids.personalEv]);
  });

  maybe('lọc trạng thái + khoảng ngày gửi', async () => {
    const approved = await vehicleApprovals.list({ status: APPROVAL_STATUS.APPROVED, q: RUN });
    expect(approved.data.map((r) => r.vehicleId)).toEqual([ids.legacy]);

    const lastWeek = await vehicleApprovals.list({
      q: RUN,
      submittedFrom: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    expect(lastWeek.data.map((r) => r.vehicleId)).not.toContain(ids.legacy);
    expect(lastWeek.meta.total).toBe(3);
  });
});

describe('2. Snapshot v2: đủ dữ liệu lúc gửi, bất biến sau đó', () => {
  maybe('ô tô gian hàng: xe · giá · chính sách · dịch vụ · điểm nhận · nguồn · người', async () => {
    const detail = await vehicleApprovals.detail(await pendingTaskOf(ids.shopCar));

    expect(detail.basis).toBe(VEHICLE_REVIEW_BASIS.SNAPSHOT);
    expect(detail.vehicle).toMatchObject({
      vehicleType: VEHICLE_TYPE.CAR,
      seatCount: 5,
      motorbikeCategory: null,
      fuelType: FUEL_TYPE.GASOLINE,
      fuelConsumptionCombined: '6.2',
      color: 'Trắng',
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
    });
    // Năm góc ảnh bắt buộc của ô tô; ảnh bìa (= mặt trước) đứng đầu.
    expect(detail.vehicle.images).toHaveLength(5);
    expect(detail.vehicle.images[0]).toBe(detail.vehicle.mainImageUrl);
    expect(detail.vehicle.features).toEqual(['bluetooth', 'camera_reverse']);
    expect(detail.pricing).toMatchObject({ weekdayPrice: '700000', discountPercent: 10 });
    expect(detail.services).toEqual([
      {
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        autoAcceptEnabled: true,
        // ADR 0112: điều khoản là của gian hàng - phiếu duyệt xe không chụp điều khoản theo xe.
        termsText: null,
      },
    ]);
    expect(detail.policy).toMatchObject({
      source: 'vehicle',
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 30,
      deliveryTiers: [
        { toKm: 5, fee: '0' },
        { toKm: 30, fee: '150000' },
      ],
      includedDistanceKmPerDay: 300,
      excessDistanceFeePerKm: '3000',
    });
    expect(detail.pickup).toMatchObject({ addressLine: '25 Hùng Vương', provinceCode: '79' });
    expect(detail.pickup?.wardName).toBeTruthy();
    expect(detail.pickup?.provinceName).toBeTruthy();
    expect(detail.source).toMatchObject({
      storefrontKind: STOREFRONT_KIND.SHOP,
      name: `Huế Rental ${RUN}`,
    });
    // Chủ xe, nguồn đăng, người bấm gửi — ba khái niệm, ba giá trị.
    expect(detail.owner?.name).toBe('Chủ Huế Rental');
    expect(detail.submitter.name).toBe('Nguyễn Văn Minh');
    // Ảnh chụp LÚC GỬI không mang giấy tờ nào. Cà vẹt + giá trị xe đi ở khối RIÊNG `insuranceReview`
    // (dữ liệu sống, đợt rà Admin 16/11/2026 - ADR 0089 đã đưa cà vẹt vào luồng tạo ô tô).
    const { insuranceReview, ...frozen } = detail;
    expect(JSON.stringify(frozen)).not.toMatch(/document|registration|inspection|insurance/i);
    expect(insuranceReview).not.toBeNull();
  });

  maybe('xe máy: phân khúc + dung tích, không số chỗ; xe điện: quãng đường + pin', async () => {
    const bike = await vehicleApprovals.detail(await pendingTaskOf(ids.personalBike));
    expect(bike.vehicle).toMatchObject({
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      seatCount: null,
      motorbikeCategory: 'underbone',
      engineDisplacementCc: 155,
    });
    expect(bike.source.storefrontKind).toBe(STOREFRONT_KIND.PERSONAL);
    // Chủ xe cá nhân TỰ gửi: chủ xe và người gửi là cùng một người.
    expect(bike.owner?.id).toBe(bike.submitter.id);

    const ev = await vehicleApprovals.detail(await pendingTaskOf(ids.personalEv));
    expect(ev.vehicle).toMatchObject({
      fuelType: FUEL_TYPE.ELECTRIC,
      electricRangeKm: 326,
      batteryCapacityKwh: '37.23',
      fuelConsumptionCombined: null,
    });
  });

  maybe('sửa xe SỐNG sau khi gửi không đổi thứ đang được duyệt', async () => {
    const taskId = await pendingTaskOf(ids.shopCar);
    await prisma.vehicle.update({
      where: { id: ids.shopCar },
      data: { name: 'Tên đổi sau khi gửi', weekdayPrice: 999000 },
    });
    await prisma.vehicleServiceSetting.updateMany({
      where: { vehicleId: ids.shopCar },
      data: { autoAcceptEnabled: false, termsText: 'Điều khoản mới' },
    });
    await prisma.rentalPolicy.updateMany({
      where: { vehicleId: ids.shopCar },
      data: { includedDistanceKmPerDay: 500 },
    });

    const detail = await vehicleApprovals.detail(taskId);
    expect(detail.vehicle.name).toBe(`Toyota Vios ${RUN}`);
    expect(detail.pricing.weekdayPrice).toBe('700000');
    expect(detail.services[0]).toMatchObject({ autoAcceptEnabled: true });
    expect(detail.policy?.includedDistanceKmPerDay).toBe(300);

    const row = (await vehicleApprovals.list({ q: RUN })).data.find(
      (r) => r.approvalTaskId === taskId,
    );
    expect(row?.vehicleName).toBe(`Toyota Vios ${RUN}`);

    await prisma.vehicle.update({
      where: { id: ids.shopCar },
      data: { name: `Toyota Vios ${RUN}`, weekdayPrice: 700000 },
    });
  });

  maybe('phiếu cũ không có snapshot: dựng từ dữ liệu SỐNG và nói rõ điều đó', async () => {
    const legacy = await prisma.approvalTask.findFirstOrThrow({
      where: { targetId: ids.legacy },
      select: { id: true },
    });
    const detail = await vehicleApprovals.detail(legacy.id);
    expect(detail.basis).toBe(VEHICLE_REVIEW_BASIS.LIVE);
    expect(detail.vehicle.name).toBe(`Kia Morning ${RUN}`);
    expect(detail.vehicle.images).toHaveLength(5);
  });
});

describe('3. Danh mục kiểm tra thủ công + ghi chú nội bộ', () => {
  maybe('đánh dấu được lưu phía server, kèm người và thời điểm', async () => {
    const taskId = await pendingTaskOf(ids.shopCar);
    const result = await vehicleApprovals.setCheck(
      taskId,
      VEHICLE_REVIEW_CHECK.PHOTOS_MATCH,
      true,
      reviewerA,
    );
    expect(result.items.map((i) => i.key)).toEqual(VEHICLE_REVIEW_CHECK_VALUES);
    expect(result.items.find((i) => i.key === VEHICLE_REVIEW_CHECK.PHOTOS_MATCH)).toMatchObject({
      passed: true,
      updatedByName: 'Reviewer A',
    });

    // "Tải lại trang": chi tiết đọc lại từ DB, không từ trạng thái của lần gọi trước.
    const detail = await vehicleApprovals.detail(taskId);
    const check = detail.manualChecks.find((c) => c.key === VEHICLE_REVIEW_CHECK.PHOTOS_MATCH);
    expect(check).toMatchObject({ passed: true, updatedByName: 'Reviewer A' });
    expect(check?.updatedAt).toBeTruthy();

    const logged = await prisma.auditLog.count({
      where: { targetId: taskId, action: 'approval.check_update' },
    });
    expect(logged).toBe(1);
  });

  maybe('mục không hợp lệ → 400; ghi lại đúng giá trị đang có là no-op', async () => {
    const taskId = await pendingTaskOf(ids.shopCar);
    await expect(
      vehicleApprovals.setCheck(taskId, 'documents_valid', true, reviewerA),
    ).rejects.toMatchObject({ status: 400 });

    await vehicleApprovals.setCheck(taskId, VEHICLE_REVIEW_CHECK.PHOTOS_MATCH, true, reviewerB);
    const detail = await vehicleApprovals.detail(taskId);
    // Người sửa vẫn là A — B không đổi gì.
    expect(
      detail.manualChecks.find((c) => c.key === VEHICLE_REVIEW_CHECK.PHOTOS_MATCH)?.updatedByName,
    ).toBe('Reviewer A');
  });

  maybe('ghi chú nội bộ: khoá lạc quan chống ghi đè âm thầm', async () => {
    const taskId = await pendingTaskOf(ids.shopCar);
    const first = await vehicleApprovals.saveInternalNote(
      taskId,
      { note: 'Đã gọi chủ xe xác nhận biển số', expectedUpdatedAt: null },
      reviewerA,
    );
    expect(first).toMatchObject({
      note: 'Đã gọi chủ xe xác nhận biển số',
      updatedByName: 'Reviewer A',
    });

    // B mở phiếu TRƯỚC khi A lưu → mốc B cầm là null, đã cũ.
    await expect(
      vehicleApprovals.saveInternalNote(
        taskId,
        { note: 'Ghi đè', expectedUpdatedAt: null },
        reviewerB,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: API_ERROR_CODE.APPROVAL_NOTE_CONFLICT,
        details: { current: { note: 'Đã gọi chủ xe xác nhận biển số' } },
      },
    });

    const second = await vehicleApprovals.saveInternalNote(
      taskId,
      { note: 'Biển số khớp ảnh', expectedUpdatedAt: first.updatedAt },
      reviewerB,
    );
    expect(second).toMatchObject({ note: 'Biển số khớp ảnh', updatedByName: 'Reviewer B' });

    // Ghi chú KHÔNG phải lý do gửi chủ xe.
    const task = await prisma.approvalTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { reason: true },
    });
    expect(task.reason).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { targetId: taskId, action: 'approval.internal_note_update' },
      }),
    ).toBe(2);
  });

  maybe('trần độ dài ghi chú giữ bằng CHECK ở DB', async () => {
    const taskId = await pendingTaskOf(ids.shopCar);
    await expect(
      prisma.approvalTask.update({
        where: { id: taskId },
        data: { internalNote: 'x'.repeat(2001) },
      }),
    ).rejects.toThrow();
  });
});

describe('4. Phê duyệt: cổng checklist ở backend + chống đua', () => {
  maybe(
    'thiếu mục thủ công → 409, phiếu và xe không đổi (cả route chung lẫn route xe)',
    async () => {
      const taskId = await pendingTaskOf(ids.shopCar);
      await expect(
        vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: API_ERROR_CODE.APPROVAL_CHECKLIST_INCOMPLETE,
          details: {
            missing: VEHICLE_REVIEW_CHECK_VALUES.filter(
              (k) => k !== VEHICLE_REVIEW_CHECK.PHOTOS_MATCH,
            ),
          },
        },
      });
      await expect(approvals.approve(taskId, reviewerA)).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.APPROVAL_CHECKLIST_INCOMPLETE },
      });

      const vehicle = await prisma.vehicle.findUniqueOrThrow({
        where: { id: ids.shopCar },
        select: { publicStatus: true },
      });
      expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
    },
  );

  maybe('hai người duyệt cùng bấm Phê duyệt: đúng MỘT quyết định', async () => {
    const taskId = await pendingTaskOf(ids.shopCar);
    for (const key of VEHICLE_REVIEW_CHECK_VALUES) {
      await vehicleApprovals.setCheck(taskId, key, true, reviewerA);
    }

    const results = await Promise.allSettled([
      vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA),
      vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerB),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.APPROVAL_ALREADY_DECIDED },
    });

    // Một lần duyệt = một log, một thông báo, một audit mang theo danh mục đã kiểm.
    expect(
      await prisma.approvalLog.count({
        where: { approvalTaskId: taskId, action: APPROVAL_ACTION.APPROVE },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: shopOwnerId, type: NOTIFICATION_TYPE.VEHICLE_APPROVED },
      }),
    ).toBe(1);
    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { targetId: ids.shopCar, action: `approval.${APPROVAL_ACTION.APPROVE}` },
      select: { afterJson: true },
    });
    expect((auditRow.afterJson as { manualChecks?: string[] }).manualChecks).toHaveLength(5);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.shopCar },
      select: { publicStatus: true },
    });
    expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    const listing = await prisma.publicListing.findUnique({
      where: { vehicleId: ids.shopCar },
      select: { status: true },
    });
    expect(listing?.status).toBe(LISTING_STATUS.ACTIVE);

    // Phiếu đã xử lý: không đánh dấu lại được.
    await expect(
      vehicleApprovals.setCheck(taskId, VEHICLE_REVIEW_CHECK.PLATE_VISIBLE, false, reviewerB),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.APPROVAL_ALREADY_DECIDED } });
  });

  maybe('bỏ đánh dấu đua với Phê duyệt: không bao giờ duyệt khi danh mục thiếu', async () => {
    const taskId = await pendingTaskOf(ids.personalBike);
    await passVehicleReviewChecks(prisma, taskId, reviewerA);

    const [approve, uncheck] = await Promise.allSettled([
      vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA),
      vehicleApprovals.setCheck(taskId, VEHICLE_REVIEW_CHECK.NOT_DUPLICATE, false, reviewerB),
    ]);

    const task = await prisma.approvalTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true, reviewChecks: { select: { passed: true } } },
    });
    if (task.status === APPROVAL_STATUS.APPROVED) {
      // Duyệt thắng: lượt bỏ đánh dấu đến sau và bị từ chối; danh mục lúc duyệt là đủ.
      expect(uncheck.status).toBe('rejected');
      expect(task.reviewChecks.every((c) => c.passed)).toBe(true);
    } else {
      // Bỏ đánh dấu thắng: lượt duyệt thấy thiếu và bị chặn.
      expect(approve.status).toBe('rejected');
      expect(task.status).toBe(APPROVAL_STATUS.PENDING);
    }
  });
});

describe('5. Từ chối / yêu cầu bổ sung: lý do bắt buộc, một transaction', () => {
  maybe('thiếu lý do → 400, không đổi gì', async () => {
    const taskId = await pendingTaskOf(ids.personalEv);
    await expect(
      vehicleApprovals.decide(APPROVAL_DECISION.REQUEST_REVISION, taskId, reviewerA, '   '),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      vehicleApprovals.decide(APPROVAL_DECISION.REJECT, taskId, reviewerA),
    ).rejects.toMatchObject({
      status: 400,
    });
    const task = await prisma.approvalTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true },
    });
    expect(task.status).toBe(APPROVAL_STATUS.PENDING);
  });

  maybe('yêu cầu bổ sung KHÔNG cần checklist; xe về tay chủ + được báo', async () => {
    const taskId = await pendingTaskOf(ids.personalEv);
    const detail = await vehicleApprovals.decide(
      APPROVAL_DECISION.REQUEST_REVISION,
      taskId,
      reviewerA,
      'Bổ sung ảnh nội thất.',
    );
    expect(detail.approvalStatus).toBe(APPROVAL_STATUS.NEEDS_REVISION);
    expect(detail.reason).toBe('Bổ sung ảnh nội thất.');
    expect(detail.logs.at(-1)).toMatchObject({
      action: APPROVAL_ACTION.REQUEST_REVISION,
      note: 'Bổ sung ảnh nội thất.',
      actorName: 'Reviewer A',
    });

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.personalEv },
      select: { publicStatus: true },
    });
    expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION);
    expect(
      await prisma.notification.count({
        where: { userId: personalOwnerId, type: NOTIFICATION_TYPE.VEHICLE_NEEDS_REVISION },
      }),
    ).toBe(1);
  });

  maybe('gửi lại → phiếu mới (resubmit) → từ chối', async () => {
    await vehicles.submitForPublicReview(personalTenantId, ids.personalEv, personalOwnerId);
    const taskId = await pendingTaskOf(ids.personalEv);
    const pending = await vehicleApprovals.detail(taskId);
    expect(pending.logs[0]).toMatchObject({ action: APPROVAL_ACTION.RESUBMIT });

    const detail = await vehicleApprovals.decide(
      'reject',
      taskId,
      reviewerB,
      'Ảnh không phải xe thật.',
    );
    expect(detail.approvalStatus).toBe(APPROVAL_STATUS.REJECTED);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: ids.personalEv },
      select: { publicStatus: true },
    });
    expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.REJECTED);
    expect(
      await prisma.auditLog.count({
        where: { targetId: ids.personalEv, action: `approval.${APPROVAL_ACTION.REJECT}` },
      }),
    ).toBe(1);
  });
});


/**
 * Chủ xe tuyến hoa hồng hiển thị tối đa 3 xe trên chợ (ADR 0085 điều 4 — trần Owner Lite gác cả
 * điểm chợ). Fixture này tạo xe thẳng bằng Prisma qua nhiều nhóm test trên CÙNG một gian hàng, nên
 * trước một nhóm mới thì các xe của nhóm trước nhả suất (tắt hiển thị) — nhóm sau không nói về trần.
 */
async function freeOwnerLiteSlots(): Promise<void> {
  if (!dbAvailable) return;
  await prisma.vehicle.updateMany({
    where: { tenantId: personalTenantId },
    data: { marketplaceEnabled: false },
  });
}

describe('6. Xe SỐNG lệch ảnh chụp: cổng phê duyệt đọc xe sẽ lên chợ', () => {
  beforeAll(freeOwnerLiteSlots);

  maybe(
    'căn cước bị sửa sau khi gửi → chi tiết cảnh báo, Phê duyệt 409, vẫn trả về được',
    async () => {
      const id = await seedVehicle(personalTenantId, { name: `Mazda 3 ${RUN}` });
      await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
      const taskId = await pendingTaskOf(id);
      await passVehicleReviewChecks(prisma, taskId, reviewerA);

      // Chủ xe sửa biển số trong lúc phiếu chờ — thứ sẽ bị KHOÁ ngay khi duyệt.
      await prisma.vehicle.update({ where: { id }, data: { plateNumber: '99Z-999.99' } });

      const detail = await vehicleApprovals.detail(taskId);
      expect(detail.approvalBlockers.changedLockedFields).toEqual(['plateNumber']);
      // Hồ sơ đang duyệt vẫn là thứ đã gửi.
      expect(detail.vehicle.plateNumber).not.toBe('99Z-999.99');

      await expect(
        vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: API_ERROR_CODE.APPROVAL_SUBJECT_CHANGED,
          details: { changedLockedFields: ['plateNumber'], missingRequirements: [] },
        },
      });
      const vehicle = await prisma.vehicle.findUniqueOrThrow({
        where: { id },
        select: { publicStatus: true },
      });
      expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);

      const returned = await vehicleApprovals.decide(
        APPROVAL_DECISION.REQUEST_REVISION,
        taskId,
        reviewerA,
        'Biển số đã đổi sau khi gửi — gửi lại để duyệt đúng biển số mới.',
      );
      expect(returned.approvalStatus).toBe(APPROVAL_STATUS.NEEDS_REVISION);
    },
  );

  maybe('xe sống không còn đủ ảnh → Phê duyệt 409 APPROVAL_SUBJECT_CHANGED', async () => {
    const id = await seedVehicle(personalTenantId, { name: `Honda City ${RUN}` });
    await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
    const taskId = await pendingTaskOf(id);
    await passVehicleReviewChecks(prisma, taskId, reviewerA);

    await prisma.vehicleImage.deleteMany({ where: { vehicleId: id, sortOrder: 3 } });

    const detail = await vehicleApprovals.detail(taskId);
    expect(detail.approvalBlockers.missingRequirements).toEqual(['photos']);
    await expect(
      vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: API_ERROR_CODE.APPROVAL_SUBJECT_CHANGED,
        details: { changedLockedFields: [], missingRequirements: ['photos'] },
      },
    });
  });

  /*
   * Cuộc đua thật: lượt sửa của chủ xe đã ghi biển số mới nhưng CHƯA commit khi người duyệt bấm
   * Phê duyệt. Không khoá dòng xe thì lượt duyệt đọc biển số CŨ, qua cổng, rồi chờ ghi xe và
   * commit `approved_public` cho một chiếc xe mang biển số không ai xem. Có khoá thì lượt duyệt
   * chờ lượt sửa commit xong rồi mới đọc.
   *
   * ⚠️ Cái CHẶN đã đổi ngày 24/09/2026, kết quả thì không. Trước đây lượt sửa để lại một snapshot
   * cũ và cổng `APPROVAL_SUBJECT_CHANGED` bắt được chênh lệch căn cước. Nay lượt sửa DỰNG LẠI
   * snapshot, nên không còn chênh lệch nào để bắt — thứ chặn là mốc `capturedAt` mà người duyệt
   * mang theo từ màn hình họ đã đọc. Cả hai đời đều từ chối duyệt một biển số chưa ai xem; đời
   * mới còn nói đúng tên việc vừa xảy ra và cho chủ xe một lối đi (sửa tiếp) thay vì một ngõ cụt.
   */
  maybe(
    'chủ xe đang sửa biển số (chưa commit) khi Phê duyệt → duyệt CHỜ rồi từ chối vì bản đã cũ',
    async () => {
      const id = await seedVehicle(personalTenantId, { name: `Mazda CX-5 ${RUN}` });
      await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
      const taskId = await pendingTaskOf(id);
      await passVehicleReviewChecks(prisma, taskId, reviewerA);
      // Mốc người duyệt ĐANG NHÌN, lấy trước khi chủ xe đụng vào xe.
      const { capturedAt } = await vehicleApprovals.detail(taskId);

      let signalLocked!: () => void;
      const locked = new Promise<void>((resolve) => (signalLocked = resolve));
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const ownerEdit = prisma.$transaction(
        async (tx) => {
          await vehicles.applyUpdate(
            tx,
            personalTenantId,
            id,
            personalOwnerId,
            {
              plateNumber: '88Z-888.88',
            },
            null,
          );
          signalLocked();
          await released;
        },
        { timeout: 15_000 },
      );
      await locked;

      const approve = vehicleApprovals
        .decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA, undefined, {
          expectedCapturedAt: capturedAt,
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      // Cho lượt duyệt kịp chạm tới khoá dòng xe trước khi lượt sửa commit.
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await ownerEdit;

      expect(await approve).toMatchObject({
        status: 409,
        response: { code: API_ERROR_CODE.APPROVAL_SNAPSHOT_STALE },
      });
      const vehicle = await prisma.vehicle.findUniqueOrThrow({
        where: { id },
        select: { publicStatus: true, plateNumber: true },
      });
      expect(vehicle).toEqual({
        publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
        plateNumber: '88Z-888.88',
      });
      // …và phiếu mang biển số MỚI: người duyệt tải lại là đọc được đúng thứ vừa đổi.
      expect((await vehicleApprovals.detail(taskId)).vehicle.plateNumber).toBe('88Z-888.88');
    },
  );

  maybe(
    'chủ xe xoá xe khi phiếu còn chờ → phiếu HUỶ có dấu vết, rời hàng đợi, không duyệt được',
    async () => {
      const id = await seedVehicle(personalTenantId, { name: `Kia Soluto ${RUN}` });
      await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
      const taskId = await pendingTaskOf(id);

      await vehicles.remove(personalTenantId, id, personalOwnerId);

      const task = await prisma.approvalTask.findUniqueOrThrow({
        where: { id: taskId },
        select: { status: true, logs: { select: { action: true }, orderBy: { createdAt: 'asc' } } },
      });
      expect(task.status).toBe(APPROVAL_STATUS.CANCELLED);
      expect(task.logs.map((l) => l.action)).toEqual([
        APPROVAL_ACTION.SUBMIT,
        APPROVAL_ACTION.CANCEL,
      ]);

      const queue = await vehicleApprovals.list({ q: `Kia Soluto ${RUN}` });
      expect(queue.data).toHaveLength(0);
      await expect(
        vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA),
      ).rejects.toMatchObject({ status: expect.any(Number) });
    },
  );
});

/*
 * Sửa xe TRONG LÚC phiếu còn chờ (24/09/2026).
 *
 * Trước ngày này, chủ xe sửa xe lúc chờ duyệt là rơi vào một ngõ cụt: nút gửi lại đã biến mất
 * (`pending_public_review` không nằm trong `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`), còn phiếu thì
 * giữ nguyên ảnh chụp cũ — người duyệt hoặc phê chuẩn một bản không còn tồn tại, hoặc bị chặn bởi
 * `APPROVAL_SUBJECT_CHANGED` và phải TỪ CHỐI một hồ sơ không sai gì để chủ xe gửi lại được.
 *
 * Nay mỗi lượt ghi của chủ xe dựng lại snapshot. Bộ này khoá bốn điều phải đúng CÙNG LÚC, vì
 * thiếu một là hỏng cả cơ chế: phiếu mang bản mới · hàng đợi mang bản mới · tick của người duyệt
 * bị đặt lại · có một dòng lịch sử giải thích vì sao.
 *
 * Đường ghi thứ ba (thiết lập theo dịch vụ, ở module LÁ `VehicleSettingsModule`) được khoá trong
 * `vehicle-settings.spec.ts` — đặt cạnh service sở hữu đường ghi đó.
 */
describe('8. Chủ xe sửa xe khi phiếu còn chờ: phiếu mang bản mới nhất', () => {
  beforeAll(freeOwnerLiteSlots);

  maybe('sửa hồ sơ → snapshot, hàng đợi và lịch sử đều theo bản mới; tick bị đặt lại', async () => {
    const id = await seedVehicle(personalTenantId, { name: `Honda City ${RUN}` });
    await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
    const taskId = await pendingTaskOf(id);
    await passVehicleReviewChecks(prisma, taskId, reviewerA);

    const before = await vehicleApprovals.detail(taskId);
    expect(before.manualChecks.filter((c) => c.passed)).toHaveLength(
      VEHICLE_REVIEW_CHECK_VALUES.length,
    );

    await vehicles.update(
      personalTenantId,
      id,
      personalOwnerId,
      {
        name: `Honda City G ${RUN}`,
        plateNumber: '51A-999.99',
      },
      null,
    );

    const after = await vehicleApprovals.detail(taskId);
    // 1. Thứ người duyệt ĐỌC là bản mới…
    expect(after.vehicle.name).toBe(`Honda City G ${RUN}`);
    expect(after.vehicle.plateNumber).toBe('51A-999.99');
    expect(after.capturedAt).not.toBe(before.capturedAt);
    // 2. …và không còn chênh lệch căn cước nào để chặn duyệt.
    expect(after.approvalBlockers.changedLockedFields).toEqual([]);
    // 3. Tick là bằng chứng về bản CŨ — phải trắng.
    expect(after.manualChecks.filter((c) => c.passed)).toHaveLength(0);
    // 4. Có dòng giải thích, và phiếu KHÔNG bị coi là gửi lại (giữ nguyên chỗ trong hàng đợi).
    expect(after.logs.map((l) => l.action)).toEqual([
      APPROVAL_ACTION.SUBMIT,
      APPROVAL_ACTION.PROFILE_UPDATED,
    ]);

    // Hình chiếu hàng đợi đi cùng — không để hàng đợi hiện tên cũ mà mở ra lại thấy tên mới.
    const queue = await vehicleApprovals.list({ q: `Honda City G ${RUN}` });
    expect(queue.data).toHaveLength(1);
    expect(queue.data[0]).toMatchObject({ plateNumber: '51A-999.99' });
  });

  maybe('sửa GIÁ khi phiếu còn chờ → phiếu mang giá mới', async () => {
    const id = await seedVehicle(personalTenantId, { name: `Kia Morning ${RUN}` });
    await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
    const taskId = await pendingTaskOf(id);

    await vehicles.savePricing(personalTenantId, id, personalOwnerId, {
      source: POLICY_SOURCE.SHOP,
      weekdayPrice: '777000',
    });

    const detail = await vehicleApprovals.detail(taskId);
    expect(detail.pricing.weekdayPrice).toBe('777000');
    expect(detail.logs.map((l) => l.action)).toContain(APPROVAL_ACTION.PROFILE_UPDATED);
  });

  maybe('người duyệt đọc lại bản mới rồi duyệt → qua', async () => {
    const id = await seedVehicle(personalTenantId, { name: `Hyundai Accent ${RUN}` });
    await vehicles.submitForPublicReview(personalTenantId, id, personalOwnerId);
    const taskId = await pendingTaskOf(id);
    const stale = (await vehicleApprovals.detail(taskId)).capturedAt;

    await vehicles.update(
      personalTenantId,
      id,
      personalOwnerId,
      { plateNumber: '51A-111.11' },
      null,
    );
    // Tick phải làm LẠI — chúng vừa bị đặt lại cùng lượt sửa.
    await passVehicleReviewChecks(prisma, taskId, reviewerA);

    // Mốc cũ ⇒ chặn, và chặn bằng đúng lý do (không phải "danh mục thiếu").
    await expect(
      vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA, undefined, {
        expectedCapturedAt: stale,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.APPROVAL_SNAPSHOT_STALE },
    });

    // Tải lại, đọc bản mới, duyệt ⇒ qua.
    const fresh = (await vehicleApprovals.detail(taskId)).capturedAt;
    await vehicleApprovals.decide(APPROVAL_DECISION.APPROVE, taskId, reviewerA, undefined, {
      expectedCapturedAt: fresh,
    });

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id },
      select: { publicStatus: true, plateNumber: true },
    });
    expect(vehicle).toEqual({
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      plateNumber: '51A-111.11',
    });
  });

  /*
   * Đại đa số lượt sửa xe KHÔNG có phiếu nào đang chờ (xe nháp, xe đã duyệt). Đường đó phải
   * không đẻ ra phiếu và không đổi trạng thái xe — nếu không, mỗi lần sửa một chiếc xe đang chạy
   * lại tự rơi vào hàng đợi duyệt.
   */
  maybe('sửa xe KHÔNG có phiếu chờ → không tạo phiếu nào', async () => {
    const id = await seedVehicle(personalTenantId, { name: `Suzuki XL7 ${RUN}` });

    await vehicles.update(
      personalTenantId,
      id,
      personalOwnerId,
      { name: `Suzuki XL7 GLX ${RUN}` },
      null,
    );

    const tasks = await prisma.approvalTask.count({
      where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: id },
    });
    expect(tasks).toBe(0);
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id },
      select: { publicStatus: true },
    });
    expect(vehicle.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.DRAFT);
  });
});

/*
 * Khối "Bảo hiểm và giấy tờ" (đợt rà Admin 16/11/2026) — người duyệt thấy giá trị xe, điều kiện bảo
 * hiểm còn thiếu, dữ liệu cà vẹt; mở ảnh cà vẹt ghi audit mỗi lần.
 */
describe('7. Bảo hiểm và giấy tờ: chỉ đọc, dữ liệu sống', () => {
  /** Kho R2 giả: ký một URL giả, không gọi mạng. */
  const fakeR2 = {
    privateEnabled: true,
    presignPrivateDownload: (key: string) =>
      Promise.resolve({ downloadUrl: `https://r2.example/${key}?sig=1`, expiresIn: 120 }),
  } as unknown as R2Service;
  const review = makeVehicleInsuranceReviewService(asService, { r2: fakeR2, audit });

  async function attachRegistration(vehicleId: string, plateNumber: string): Promise<string> {
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { tenantId: true },
    });
    const documentId = newId();
    const fileId = newId();
    const versionId = newId();
    await prisma.vehicleDocument.create({
      data: {
        id: documentId,
        tenantId: vehicle.tenantId,
        vehicleId,
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        holderName: 'Nguyễn Văn A',
        chassisNumber: 'RLA1234567890ABCD',
        engineNumber: '2NR1234567',
        plateNumber,
      },
    });
    await prisma.vehiclePrivateFile.create({
      data: {
        id: fileId,
        tenantId: vehicle.tenantId,
        vehicleId,
        purpose: 'vehicle_document',
        objectKey: `tenants/${vehicle.tenantId}/vehicles/${vehicleId}/documents/${fileId}.jpg`,
        originalName: 'ca-vet.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        status: 'ready',
      },
    });
    await prisma.vehicleDocumentVersion.create({
      data: {
        id: versionId,
        tenantId: vehicle.tenantId,
        vehicleId,
        documentId,
        privateFileId: fileId,
        version: 1,
      },
    });
    await prisma.vehicleDocument.update({
      where: { id: documentId },
      data: { activeVersionId: versionId },
    });
    return documentId;
  }

  maybe('xe chưa khai giá trị, chưa có cà vẹt: liệt kê đúng điều kiện còn thiếu', async () => {
    // Ô tô của gian hàng đã gửi duyệt ở đầu bộ (seed không khai giá trị, không có cà vẹt). Phiếu có
    // thể đã được quyết ở mục 4 - chi tiết vẫn đọc được, khối này luôn là dữ liệu SỐNG.
    const vehicleId = ids.shopCar;
    const task = await prisma.approvalTask.findFirstOrThrow({
      where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: vehicleId },
      orderBy: { submittedAt: 'desc' },
      select: { id: true },
    });
    const detail = await vehicleApprovals.detail(task.id);
    expect(detail.insuranceReview).toMatchObject({
      insuredValue: null,
      referenceValue: null,
      deviationPercent: null,
      deviationWarning: false,
      registration: null,
    });
    expect(detail.insuranceReview!.eligibilityGaps).toEqual(
      expect.arrayContaining([
        INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING,
        INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING,
      ]),
    );
    // Không có ảnh cà vẹt để mở.
    await expect(review.registrationImage(vehicleId, reviewerA)).rejects.toMatchObject({
      status: 404,
    });
  });

  maybe('cà vẹt có ảnh: hiện số khung/máy, cảnh báo biển số lệch, mở ảnh ghi audit', async () => {
    const vehicleId = await seedVehicle(shopTenantId, {
      insuredValue: new Prisma.Decimal(500_000_000),
    });
    const documentId = await attachRegistration(vehicleId, '30K-999.99');
    const result = await review.review(vehicleId);
    expect(result!.insuredValue).toBe('500000000');
    expect(result!.registration).toMatchObject({
      documentId,
      holderName: 'Nguyễn Văn A',
      chassisNumber: 'RLA1234567890ABCD',
      engineNumber: '2NR1234567',
      plateMatches: false,
      hasImage: true,
    });
    expect(result!.eligibilityGaps).not.toContain(INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING);
    expect(result!.eligibilityGaps).not.toContain(INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING);

    // Biển số cùng chữ số, khác dấu ⇒ khớp.
    const plate = (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }))
      .plateNumber!;
    await prisma.vehicleDocument.update({
      where: { id: documentId },
      data: { plateNumber: plate.replace(/[-.]/g, ' ').toLowerCase() },
    });
    expect((await review.review(vehicleId))!.registration!.plateMatches).toBe(true);

    const before = await prisma.auditLog.count({
      where: { action: 'vehicle_document.view_registration_image', targetId: documentId },
    });
    const image = await review.registrationImage(vehicleId, reviewerA);
    expect(image.url).toContain(`/vehicles/${vehicleId}/documents/`);
    expect(image.expiresIn).toBe(120);
    const after = await prisma.auditLog.count({
      where: { action: 'vehicle_document.view_registration_image', targetId: documentId },
    });
    expect(after).toBe(before + 1);
  });
});
