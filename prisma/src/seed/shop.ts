/**
 * Dựng TRỌN một gian hàng từ bản khai của nó.
 *
 * Thứ tự các bước ở `buildShop` không tuỳ tiện — vài chỗ là ràng buộc thật:
 *   • chính sách thuê phải có TRƯỚC khi đồng bộ snapshot marketplace, vì nhãn "miễn thế chấp"
 *     suy từ chính sách hiệu lực (ADR 0008);
 *   • chiếm dụng lịch bị xoá sạch rồi dựng lại, vì mốc thời gian neo vào NGÀY CHẠY SEED — giữ
 *     lại khoảng của lần chạy trước sẽ đụng exclusion constraint khi seed chạy lại khác ngày;
 *   • xe phải có trước khi tạo bản ghi đè chính sách theo xe.
 */
import {
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  BRANCH_STATUS,
  COLLATERAL_ASSET_TYPE,
  COLLATERAL_MODE,
  DOCUMENT_STATUS,
  DRIVER_STATUS,
  DRIVER_TYPE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SUBSCRIPTION_STATUS,
  TENANT_DOCUMENT_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { upsertPasswordUser, type CustomerAccounts, type PlatformAccounts } from './accounts';
import { VEHICLE_MODEL_BY_KEY } from './catalog';
import { DEMO_PASSWORD, daysFromToday, log, prisma, seedId } from './context';
import { syncListing } from './listing';
import {
  buildBookingRequests,
  buildBookings,
  buildContracts,
  buildCustomers,
  buildHandovers,
  buildMoney,
  buildReviews,
} from './shop-operations';
import { buildDailyPrices, buildFleet, buildNonBookingOccupancy } from './shop-fleet';
import { fleetSize, type ShopSpec } from './shops';
import type { FinanceCategoryIds, PlanIds } from './system';

export interface ShopBuildDeps {
  platform: PlatformAccounts;
  customers: CustomerAccounts;
  financeCategoryIds: FinanceCategoryIds;
  planIds: PlanIds;
  /** Nhãn hiển thị của hãng xe, đọc từ `catalog_items` — tên xe dựng từ danh mục thật. */
  brandLabels: ReadonlyMap<string, string>;
}

export interface ShopBuildResult {
  name: string;
  vehicles: number;
  listings: number;
  bookings: number;
  customers: number;
  receipts: number;
  reviews: number;
}

/** Tài xế mẫu — đủ ba loại hình, kèm một người đã nghỉ để thử lọc "chỉ tài xế đang làm". */
const DRIVER_POOL = [
  { name: 'Nguyễn Văn Dũng', phone: '0921000001', type: DRIVER_TYPE.STAFF, licence: 'B2' },
  { name: 'Trần Hữu Phước', phone: '0921000002', type: DRIVER_TYPE.STAFF, licence: 'D' },
  { name: 'Lê Minh Trí', phone: '0921000003', type: DRIVER_TYPE.COLLABORATOR, licence: 'B2' },
  { name: 'Phạm Văn Lộc', phone: '0921000004', type: DRIVER_TYPE.TEMPORARY, licence: 'C' },
] as const;

export async function buildShop(spec: ShopSpec, deps: ShopBuildDeps): Promise<ShopBuildResult> {
  const isActive = spec.status === TENANT_STATUS.ACTIVE;

  // ── Tài khoản chủ và nhân viên ──────────────────────────────────────────
  const ownerUserId = await upsertPasswordUser({
    email: spec.owner.email,
    password: DEMO_PASSWORD,
    displayName: spec.owner.displayName,
    phone: spec.owner.phone,
    phoneVerified: true,
  });

  // ── Gian hàng ───────────────────────────────────────────────────────────
  const tenantFields = {
    code: spec.code,
    name: spec.name,
    tenantType: spec.tenantType,
    status: spec.status,
    ownerUserId,
    phone: spec.owner.phone,
    email: spec.owner.email,
  };
  const tenant = await prisma.tenant.upsert({
    where: { slug: spec.slug },
    update: tenantFields,
    create: { id: seedId(`tenant:${spec.slug}`), slug: spec.slug, ...tenantFields },
    select: { id: true },
  });
  const tenantId = tenant.id;

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId, userId: ownerUserId } },
    update: { status: MEMBERSHIP_STATUS.ACTIVE, roleKey: TENANT_ROLE.SHOP_OWNER },
    create: {
      id: seedId(`${spec.key}:membership:owner`),
      tenantId,
      userId: ownerUserId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: daysFromToday(-120, 2),
    },
  });

  let staffUserId = ownerUserId;
  for (const staff of spec.staff) {
    const userId = await upsertPasswordUser({
      email: staff.email,
      password: DEMO_PASSWORD,
      displayName: staff.displayName,
      phone: staff.phone,
      phoneVerified: true,
    });
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      update: { status: MEMBERSHIP_STATUS.ACTIVE, roleKey: staff.roleKey },
      create: {
        id: seedId(`${spec.key}:membership:${staff.email}`),
        tenantId,
        userId,
        roleKey: staff.roleKey,
        status: MEMBERSHIP_STATUS.ACTIVE,
        invitedBy: ownerUserId,
        joinedAt: daysFromToday(-90, 2),
      },
    });
    // Người lập đơn trong dữ liệu demo là NHÂN VIÊN, không phải chủ — đúng với thực tế vận
    // hành, và nhờ vậy màn "ai tạo đơn này" có hai vai khác nhau để phân biệt.
    if (staff.roleKey === TENANT_ROLE.SHOP_STAFF) staffUserId = userId;
  }

  // ── Hồ sơ gian hàng ─────────────────────────────────────────────────────
  const defaultBranch = spec.branches.find((b) => b.isDefault) ?? spec.branches[0]!;
  const profileFields = {
    displayName: spec.name,
    bio: spec.profile.bio,
    address: spec.profile.address,
    // Hai cột tỉnh trên hồ sơ là BẢN SAO tương thích ngược của chi nhánh mặc định — nguồn vị
    // trí thật là `tenant_branches`.
    provinceCode: defaultBranch.provinceCode,
    provinceName: null as string | null,
    taxCode: spec.profile.taxCode,
    businessLicenseNo: spec.profile.businessLicenseNo,
    bankName: spec.profile.bank?.name ?? null,
    bankAccountNo: spec.profile.bank?.accountNo ?? null,
    bankAccountName: spec.profile.bank?.accountName ?? null,
    ownerFullName: spec.profile.ownerFullName,
    ownerPhone: spec.owner.phone,
    ownerEmail: spec.owner.email,
  };
  const province = await prisma.province.findUnique({
    where: { code: defaultBranch.provinceCode },
    select: { name: true },
  });
  profileFields.provinceName = province?.name ?? null;

  await prisma.tenantProfile.upsert({
    where: { tenantId },
    update: profileFields,
    create: { tenantId, ...profileFields },
  });

  // ── Chi nhánh ───────────────────────────────────────────────────────────
  const branchIds: Array<{ id: string; provinceCode: string }> = [];
  for (const branch of spec.branches) {
    const fields = {
      name: branch.name,
      provinceCode: branch.provinceCode,
      address: branch.address,
      phone: branch.phone,
      // Toạ độ khai TRONG seed thay vì để geocode lúc chạy: seed phải chạy được offline, tất
      // định, và không tốn hạn mức bản đồ mỗi lần ai đó dựng lại dữ liệu demo (ADR 0018).
      latitude: branch.latitude,
      longitude: branch.longitude,
      isDefault: branch.isDefault ?? false,
      status: branch.status ?? BRANCH_STATUS.ACTIVE,
    };
    const row = await prisma.tenantBranch.upsert({
      where: { tenantId_code: { tenantId, code: branch.code } },
      update: fields,
      create: {
        id: seedId(`${spec.key}:branch:${branch.code}`),
        tenantId,
        code: branch.code,
        createdBy: ownerUserId,
        ...fields,
      },
      select: { id: true },
    });
    branchIds.push({ id: row.id, provinceCode: branch.provinceCode });
  }

  await buildOnboarding(spec, tenantId, ownerUserId, deps.platform);
  await buildSubscription(spec, tenantId, deps);
  await buildRentalPolicies(spec, tenantId);

  // ── Tài xế ──────────────────────────────────────────────────────────────
  const driverIds: string[] = [];
  for (let i = 0; i < spec.driverCount; i += 1) {
    const driver = DRIVER_POOL[i % DRIVER_POOL.length]!;
    const id = seedId(`${spec.key}:driver:${driver.phone}`);
    const fields = {
      name: driver.name,
      phone: driver.phone,
      driverType: driver.type,
      licenseNo: `${driver.licence}-${String(120000 + i * 37)}`,
      licenseExpiresAt: daysFromToday(600 + i * 40),
      // Người cuối trong danh sách đã nghỉ — cần một tài xế `inactive` thật để thử bộ lọc và
      // để kiểm chứng rằng đơn mới không gán được cho người đã nghỉ.
      status:
        i === spec.driverCount - 1 && spec.driverCount > 2
          ? DRIVER_STATUS.INACTIVE
          : DRIVER_STATUS.ACTIVE,
    };
    await prisma.driver.upsert({
      where: { id },
      update: fields,
      create: { id, tenantId, ...fields },
    });
    if (fields.status === DRIVER_STATUS.ACTIVE) driverIds.push(id);
  }

  // ── Đội xe ──────────────────────────────────────────────────────────────
  const units = await buildFleet(spec, {
    tenantId,
    ownerUserId,
    branchIds,
    brandLabels: deps.brandLabels,
    withDocuments: spec.depth === 'full',
    withMaintenance: spec.depth === 'full' || spec.depth === 'medium',
  });

  await buildVehicleOverridePolicy(spec, tenantId, units);
  await buildVehicleApprovals(spec, tenantId, ownerUserId, deps.platform, units);

  // Lịch dựng lại từ đầu mỗi lần seed — xem ghi chú đầu file.
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });

  const opsDeps = {
    tenantId,
    ownerUserId,
    staffUserId,
    customers: deps.customers,
    financeCategoryIds: deps.financeCategoryIds,
    full: spec.depth === 'full',
  };

  const customers = await buildCustomers(spec, opsDeps);
  const bookings =
    spec.depth === 'minimal' || spec.depth === 'none'
      ? []
      : await buildBookings(spec, opsDeps, units, customers, driverIds);

  await buildContracts(spec, opsDeps, bookings);
  await buildHandovers(spec, opsDeps, bookings);
  const money =
    bookings.length > 0
      ? await buildMoney(spec, opsDeps, bookings)
      : { payments: 0, receipts: 0, surcharges: 0, settlements: 0 };
  const reviews = await buildReviews(spec, opsDeps, bookings);
  await buildBookingRequests(spec, opsDeps, units, customers, bookings);

  const longTermHeld = new Set(
    bookings.filter((b) => b.plan.longTermPackageMonths !== null).map((b) => b.plan.unit.id),
  );
  if (spec.depth === 'full' || spec.depth === 'medium') {
    await buildNonBookingOccupancy(spec, { tenantId, ownerUserId }, units, longTermHeld);
    await buildDailyPrices(spec, tenantId, ownerUserId, units);
  }

  await buildNotifications(spec, tenantId, ownerUserId);

  // ── Snapshot marketplace (ADR 0008) — luôn là bước CUỐI ─────────────────
  let listings = 0;
  for (const unit of units) {
    if (await syncListing(unit.id)) listings += 1;
  }

  const result: ShopBuildResult = {
    name: spec.name,
    vehicles: units.length,
    listings,
    bookings: bookings.length,
    customers: customers.length,
    receipts: money.receipts,
    reviews,
  };

  log(
    `  ${spec.name}: ${result.vehicles} xe · ${spec.branches.length} chi nhánh · ` +
      `${result.listings} tin đăng · ${result.bookings} đơn · ${result.customers} khách · ` +
      `${result.receipts} phiếu · ${result.reviews} đánh giá` +
      (isActive ? '' : ' · CHƯA DUYỆT'),
  );
  if (result.vehicles !== fleetSize(spec)) {
    throw new Error(`Đội xe lệch bản khai: ${result.vehicles} ≠ ${fleetSize(spec)}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Mở gian hàng: giấy tờ + task duyệt
// ---------------------------------------------------------------------------

/**
 * Hồ sơ mở gian hàng đi qua `approval_tasks` — CLAUDE.md mục 6, lằn ranh 2: không có đường
 * tắt nào bật một gian hàng thành `active` mà không để lại vết duyệt.
 *
 * Gian hàng đang chờ duyệt giữ nguyên task `pending` và giấy tờ `pending`: màn duyệt của nền
 * tảng cần một hồ sơ thật để mở ra, không phải một danh sách rỗng.
 */
async function buildOnboarding(
  spec: ShopSpec,
  tenantId: string,
  ownerUserId: string,
  platform: PlatformAccounts,
): Promise<void> {
  const approved = spec.status === TENANT_STATUS.ACTIVE;
  const submittedAt = daysFromToday(-120, 2);
  const reviewedAt = daysFromToday(-118, 6);

  const documents = [
    { type: TENANT_DOCUMENT_TYPE.CCCD_FRONT, name: 'CCCD mặt trước' },
    { type: TENANT_DOCUMENT_TYPE.CCCD_BACK, name: 'CCCD mặt sau' },
    ...(spec.profile.businessLicenseNo
      ? [{ type: TENANT_DOCUMENT_TYPE.BUSINESS_LICENSE, name: 'Giấy phép kinh doanh' }]
      : []),
  ];
  for (const doc of documents) {
    const id = seedId(`${spec.key}:tenant-doc:${doc.type}`);
    await prisma.tenantDocument.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        documentType: doc.type,
        fileUrl: `https://files.xeprime.test/tenants/${tenantId}/${doc.type}.jpg`,
        status: approved ? DOCUMENT_STATUS.APPROVED : DOCUMENT_STATUS.PENDING,
        uploadedBy: ownerUserId,
        reviewedBy: approved ? platform.reviewerUserId : null,
        reviewedAt: approved ? reviewedAt : null,
      },
    });
  }

  const taskId = seedId(`${spec.key}:approval:tenant`);
  await prisma.approvalTask.upsert({
    where: { id: taskId },
    update: {},
    create: {
      id: taskId,
      tenantId,
      targetType: APPROVAL_TARGET_TYPE.TENANT,
      targetId: tenantId,
      status: approved ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.PENDING,
      submittedBy: ownerUserId,
      submittedAt,
      reviewedBy: approved ? platform.reviewerUserId : null,
      reviewedAt: approved ? reviewedAt : null,
      reason: approved ? 'Hồ sơ đầy đủ, giấy tờ rõ ràng.' : null,
      snapshot: { name: spec.name, tenantType: spec.tenantType, address: spec.profile.address },
    },
  });

  await prisma.approvalLog.upsert({
    where: { id: seedId(`${spec.key}:approval-log:submit`) },
    update: {},
    create: {
      id: seedId(`${spec.key}:approval-log:submit`),
      approvalTaskId: taskId,
      action: 'submit',
      fromStatus: null,
      toStatus: APPROVAL_STATUS.PENDING,
      note: 'Chủ gian hàng gửi hồ sơ mở gian hàng.',
      actorUserId: ownerUserId,
      createdAt: submittedAt,
    },
  });
  if (approved) {
    await prisma.approvalLog.upsert({
      where: { id: seedId(`${spec.key}:approval-log:approve`) },
      update: {},
      create: {
        id: seedId(`${spec.key}:approval-log:approve`),
        approvalTaskId: taskId,
        action: 'approve',
        fromStatus: APPROVAL_STATUS.PENDING,
        toStatus: APPROVAL_STATUS.APPROVED,
        note: 'Đã đối chiếu giấy tờ, duyệt mở gian hàng.',
        actorUserId: platform.reviewerUserId,
        createdAt: reviewedAt,
      },
    });
    // Lằn ranh 3: quyết định của đội ngũ nền tảng để lại vết ở `audit_logs`.
    await prisma.auditLog.upsert({
      where: { id: seedId(`${spec.key}:audit:tenant-approve`) },
      update: {},
      create: {
        id: seedId(`${spec.key}:audit:tenant-approve`),
        tenantId,
        actorUserId: platform.reviewerUserId,
        actorScope: 'platform',
        action: 'tenant.approve',
        targetType: 'tenant',
        targetId: tenantId,
        afterJson: { status: TENANT_STATUS.ACTIVE },
        createdAt: reviewedAt,
      },
    });
  }
}

/** Vài xe đã qua duyệt public — để màn lịch sử duyệt của nền tảng có dữ liệu thật. */
async function buildVehicleApprovals(
  spec: ShopSpec,
  tenantId: string,
  ownerUserId: string,
  platform: PlatformAccounts,
  units: ReadonlyArray<{ id: string; code: string; approved: boolean }>,
): Promise<void> {
  for (const unit of units.slice(0, 6)) {
    const id = seedId(`${spec.key}:approval:vehicle:${unit.code}`);
    await prisma.approvalTask.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: unit.id,
        status: unit.approved ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.PENDING,
        submittedBy: ownerUserId,
        submittedAt: daysFromToday(-100, 2),
        reviewedBy: unit.approved ? platform.reviewerUserId : null,
        reviewedAt: unit.approved ? daysFromToday(-99, 4) : null,
        reason: unit.approved ? 'Ảnh và giấy tờ hợp lệ.' : null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Thuê bao gói dịch vụ
// ---------------------------------------------------------------------------

async function buildSubscription(
  spec: ShopSpec,
  tenantId: string,
  deps: ShopBuildDeps,
): Promise<void> {
  if (!spec.planCode) return;
  const plan = deps.planIds.get(spec.planCode);
  if (!plan) return;

  /*
   * ADR 0029 — gói giá phẳng theo chỗ: kỳ bán tối thiểu 3 THÁNG, số chỗ theo đội xe của từng
   * gian hàng demo (spec.planSlots), tiền = chỗ × đơn giá × tháng. Gói tuyến hoa hồng (không
   * planSlots) giữ nguyên đường cũ: 0đ, chỗ theo gói.
   */
  const slots = spec.planSlots ?? plan.slots;
  const termMonths = spec.planSlots ? 3 : 1;
  const price = spec.planSlots
    ? (plan.basePriceMonthly +
        slots.car * plan.perVehiclePrice.car +
        slots.motorbike * plan.perVehiclePrice.motorbike) *
      termMonths
    : plan.price;

  const id = seedId(`${spec.key}:subscription`);
  await prisma.tenantSubscription.upsert({
    where: { id },
    update: {},
    create: {
      id,
      tenantId,
      planId: plan.id,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      // `price` là tiền CẢ KỲ — cùng ngữ nghĩa với `BillingService.assign` (pricing.total).
      price,
      // Snapshot chế độ thu phí từ gói (ADR 0015/0024) — cùng hình dạng dòng mà
      // BillingService.assign ghi, để dữ liệu demo không khác dữ liệu thật.
      termMonths,
      slotsJson: slots,
      billingMode: plan.billingMode,
      commissionPercent: plan.commissionPercent,
      startsAt: daysFromToday(-15, 0),
      endsAt: daysFromToday(15 + (termMonths - 1) * 30, 0),
      note: 'Gói đang hiệu lực (seed demo).',
      createdBy: deps.platform.adminUserId,
    },
  });
}

// ---------------------------------------------------------------------------
// Chính sách thuê
// ---------------------------------------------------------------------------

/**
 * Ba tầng chính sách, đúng thứ tự ưu tiên mà `PricingService` đọc: ghi đè theo XE → mặc định
 * theo LOẠI XE → mặc định chung của gian hàng.
 *
 * Ba chế độ bảo đảm LOẠI TRỪ nhau và DB canh bằng CHECK `rental_policies_collateral_scope_check`:
 * `cash` phải có tiền cọc > 0 và không có tài sản; `asset` phải cọc = 0 và có ít nhất một loại
 * tài sản; `none` thì cả hai đều rỗng. Seed dựng đủ cả ba để mọi nhánh giao diện có dữ liệu.
 */
async function buildRentalPolicies(spec: ShopSpec, tenantId: string): Promise<void> {
  const existingDefault = await prisma.rentalPolicy.findFirst({
    where: { tenantId, vehicleId: null, vehicleType: null },
    select: { id: true },
  });
  const defaultFields = {
    collateralMode: COLLATERAL_MODE.CASH,
    collateralAssetTypes: [],
    depositAmount: 5_000_000,
    deliveryEnabled: true,
    deliveryMaxRadiusKm: 10,
    deliveryTiers: [
      { toKm: 3, fee: '0' },
      { toKm: 5, fee: '30000' },
      { toKm: 10, fee: '50000' },
    ],
    overtimeFeePerHour: 100_000,
    overtimeGraceMinutes: 30,
    overtimeRoundingMinutes: 30,
    discountEnabled: true,
    // Ưu đãi CAM KẾT THỜI HẠN của dịch vụ thuê dài hạn, đo bằng THÁNG và KHÔNG cộng dồn: gói
    // lấy mốc cao nhất nó chạm tới (ADR 0011). % không được giảm khi thời hạn tăng.
    discountTiers: [
      { minMonths: 1, percent: 5, note: 'Ưu đãi cam kết 1 tháng' },
      { minMonths: 3, percent: 15, note: 'Ưu đãi cam kết 3 tháng' },
      { minMonths: 6, percent: 20, note: 'Ưu đãi cam kết từ 6 tháng' },
    ],
  };
  if (existingDefault) {
    await prisma.rentalPolicy.update({ where: { id: existingDefault.id }, data: defaultFields });
  } else {
    await prisma.rentalPolicy.create({
      data: {
        id: seedId(`${spec.key}:policy:default`),
        tenantId,
        vehicleId: null,
        vehicleType: null,
        ...defaultFields,
      },
    });
  }

  const hasMotorbike = spec.fleet.some(
    (entry) => VEHICLE_MODEL_BY_KEY.get(entry.model)?.vehicleType === VEHICLE_TYPE.MOTORBIKE,
  );
  if (!hasMotorbike) return;

  // Xe máy giữ GIẤY TỜ thay vì tiền mặt — cách làm phổ biến thật ngoài đời, và là ca duy nhất
  // để kiểm chứng nhánh `asset` của ràng buộc bảo đảm.
  const existingBike = await prisma.rentalPolicy.findFirst({
    where: { tenantId, vehicleId: null, vehicleType: VEHICLE_TYPE.MOTORBIKE },
    select: { id: true },
  });
  const bikeFields = {
    collateralMode: COLLATERAL_MODE.ASSET,
    collateralAssetTypes: [COLLATERAL_ASSET_TYPE.VEHICLE_REGISTRATION],
    depositAmount: 0,
    deliveryEnabled: false,
    deliveryMaxRadiusKm: null,
    deliveryTiers: [],
    overtimeFeePerHour: 20_000,
    overtimeGraceMinutes: 30,
    overtimeRoundingMinutes: 60,
    discountEnabled: true,
    discountTiers: [{ minMonths: 1, percent: 10, note: 'Thuê xe máy theo tháng' }],
  };
  if (existingBike) {
    await prisma.rentalPolicy.update({ where: { id: existingBike.id }, data: bikeFields });
  } else {
    await prisma.rentalPolicy.create({
      data: {
        id: seedId(`${spec.key}:policy:motorbike`),
        tenantId,
        vehicleId: null,
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        ...bikeFields,
      },
    });
  }
}

/**
 * Một chiếc xe MIỄN THẾ CHẤP hoàn toàn — nguồn duy nhất của nhãn đó trên sàn là chính sách
 * `none`, nên không có bản ghi này thì bộ lọc "miễn thế chấp" của marketplace không bao giờ
 * trả về kết quả nào.
 */
async function buildVehicleOverridePolicy(
  spec: ShopSpec,
  tenantId: string,
  units: ReadonlyArray<{ id: string; code: string; approved: boolean }>,
): Promise<void> {
  if (spec.depth !== 'full' && spec.depth !== 'medium') return;
  const target = units.find((u) => u.approved);
  if (!target) return;

  const fields = {
    collateralMode: COLLATERAL_MODE.NONE,
    collateralAssetTypes: [],
    depositAmount: 0,
    deliveryEnabled: true,
    deliveryMaxRadiusKm: 5,
    deliveryTiers: [{ toKm: 5, fee: '0' }],
    overtimeFeePerHour: 100_000,
    overtimeGraceMinutes: 30,
    overtimeRoundingMinutes: 30,
    discountEnabled: false,
    discountTiers: [],
  };
  await prisma.rentalPolicy.upsert({
    where: { vehicleId: target.id },
    update: fields,
    create: {
      id: seedId(`${spec.key}:policy:vehicle:${target.code}`),
      tenantId,
      vehicleId: target.id,
      vehicleType: null,
      ...fields,
    },
  });
}

// ---------------------------------------------------------------------------
// Thông báo
// ---------------------------------------------------------------------------

/** Vài thông báo chưa đọc cho chủ gian hàng — chuông thông báo cần có số để hiện. */
async function buildNotifications(
  spec: ShopSpec,
  tenantId: string,
  ownerUserId: string,
): Promise<void> {
  const items = [
    {
      key: 'request',
      type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED,
      title: 'Yêu cầu đặt xe mới',
      body: 'Một khách vừa gửi yêu cầu thuê xe, bấm để xem và duyệt.',
      day: -1,
    },
    {
      key: 'booking',
      type: NOTIFICATION_TYPE.BOOKING_CREATED,
      title: 'Đơn thuê mới được tạo',
      body: 'Nhân viên vừa lập một đơn thuê cho khách.',
      day: -2,
    },
  ];
  for (const item of items) {
    const id = seedId(`${spec.key}:notification:${item.key}`);
    await prisma.notification.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        userId: ownerUserId,
        type: item.type,
        title: item.title,
        body: item.body,
        createdAt: daysFromToday(item.day, 5),
      },
    });
  }
}
