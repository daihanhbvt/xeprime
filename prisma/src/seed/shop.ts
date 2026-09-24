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
  BANK_ACCOUNT_STATUS,
  BILLING_MODE,
  BRANCH_STATUS,
  COMMISSION_TRACK_TERM_MONTHS,
  SHOP_PLAN_CODE,
  SHOP_ONBOARDING_STATE,
  addCalendarMonthsVn,
  WALLET_OWNER_TYPE,
  WALLET_STATUS,
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
  resolveStorefrontKind,
} from '@xeprime/types';
import { upsertPasswordUser, type CustomerAccounts, type PlatformAccounts } from './accounts';
import { VEHICLE_MODEL_BY_KEY } from './catalog';
import { Prisma } from '../index';
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

/**
 * Kỳ hạn của dòng thuê bao GÓI trong dữ liệu demo — kỳ NGẮN NHẤT đang được bán (ADR 0029).
 *
 * Dùng kỳ nhỏ nhất thay vì 12 tháng để màn 'Gói của tôi' của gian hàng demo có một ngày hết hạn
 * gần, nhìn thấy được trên màn hình. Nó vẫn ở tương lai xa hơn mọi mốc demo khác nên không tự
 * rơi vào ân hạn giữa hai lần seed.
 */
const PACKAGE_DEMO_TERM_MONTHS = 3;

/**
 * Ba BẬC gian hàng (ADR 0041 điều 7) — dùng để suy cửa vào onboarding từ `planCode`.
 *
 * Một `Set` thay vì so chuỗi với một hằng: từ ADR 0041 tuyến gói có ba mã, và một phép so đơn
 * lẻ sẽ lặng lẽ xếp hai bậc còn lại vào tuyến hoa hồng — gian hàng demo 40 xe sẽ ra đời với
 * `onboarding_state = commission` và mọi màn đọc tuyến sẽ nói sai về nó.
 */
const PACKAGE_PLAN_CODES: ReadonlySet<string> = new Set(Object.values(SHOP_PLAN_CODE));

/**
 * Giá ĐÀM PHÁN của gian hàng demo nằm trên bậc bán-qua-tư-vấn (ADR 0041 điều 5).
 *
 * Bậc đó không có bảng giá để rơi về, và một dòng thuê bao 0đ trong dữ liệu demo nói sai hai
 * điều cùng lúc: nó làm màn "Gói của tôi" hiện một gói miễn phí, và nó làm mọi báo cáo doanh thu
 * demo thiếu đúng khách hàng lớn nhất. Con số ở đây là một hợp đồng giả định cho kỳ
 * `PACKAGE_DEMO_TERM_MONTHS` — cùng vai trò với `price` mà admin gõ ở `BillingService.assign`.
 */
const PACKAGE_DEMO_NEGOTIATED_PRICE = 6_000_000;

/** Tài xế mẫu — đủ ba loại hình, kèm một người đã nghỉ để thử lọc "chỉ tài xế đang làm". */
const DRIVER_POOL = [
  { name: 'Nguyễn Văn Dũng', phone: '0921000001', type: DRIVER_TYPE.STAFF, licence: 'B2' },
  { name: 'Trần Hữu Phước', phone: '0921000002', type: DRIVER_TYPE.STAFF, licence: 'D' },
  { name: 'Lê Minh Trí', phone: '0921000003', type: DRIVER_TYPE.COLLABORATOR, licence: 'B2' },
  { name: 'Phạm Văn Lộc', phone: '0921000004', type: DRIVER_TYPE.TEMPORARY, licence: 'C' },
] as const;

export async function buildShop(spec: ShopSpec, deps: ShopBuildDeps): Promise<ShopBuildResult> {
  /** ADR 0036: hai trục độc lập — vận hành (`status`) và xác minh (`verificationPending`). */
  const isActive = spec.status === TENANT_STATUS.ACTIVE;
  const isVerified = !spec.verificationPending;

  // ── Tài khoản chủ và nhân viên ──────────────────────────────────────────
  const ownerUserId = await upsertPasswordUser({
    email: spec.owner.email,
    password: DEMO_PASSWORD,
    displayName: spec.owner.displayName,
    phone: spec.owner.phone,
    phoneVerified: true,
    ...(spec.owner.avatarUrl ? { avatarUrl: spec.owner.avatarUrl } : {}),
  });

  // ── Gian hàng ───────────────────────────────────────────────────────────
  const tenantFields = {
    code: spec.code,
    name: spec.name,
    tenantType: spec.tenantType,
    status: spec.status,
    /*
     * Trục ĐĂNG KÝ (ADR 0040) — SUY từ `planCode`, không khai tay trong `ShopSpec`.
     *
     * Bản khai đã nói gian hàng này dùng gói nào; một trường thứ hai nói "cửa vào" chỉ là cơ hội
     * để hai chỗ lệch nhau (đúng loại lỗi mà docblock của `commission-owners.ts` kể lại). Gian
     * hàng demo mang một BẬC gian hàng là gian hàng ĐÃ trả tiền ⇒ `package_active`; mọi gian
     * hàng còn lại là tuyến hoa hồng ⇒ `commission`.
     *
     * KHÔNG có gian hàng demo nào ở `package_pending`: seed dựng dữ liệu đã vận hành được, còn
     * `package_pending` là một gian hàng chưa dùng được gì cả. Muốn thử màn onboarding thì đi
     * đúng luồng thật ("Đăng ký gian hàng" → bước 2), vì đó chính là thứ cần thử.
     */
    onboardingState: PACKAGE_PLAN_CODES.has(spec.planCode ?? '')
      ? SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE
      : SHOP_ONBOARDING_STATE.COMMISSION,
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
    coverUrl: spec.profile.coverUrl ?? null,
    // Hai cột tỉnh trên hồ sơ là BẢN SAO tương thích ngược của chi nhánh mặc định — nguồn vị
    // trí thật là `tenant_branches`.
    provinceCode: defaultBranch.provinceCode,
    provinceName: null as string | null,
    wardCode: defaultBranch.wardCode,
    wardName: null as string | null,
    taxCode: spec.profile.taxCode,
    businessLicenseNo: spec.profile.businessLicenseNo,
    // KHÔNG còn cột ngân hàng / chủ gian hàng ở đây (16/09/2026): tài khoản nhận tiền đi vào
    // `bank_accounts` (xem `buildBankAccount`), còn chủ gian hàng LÀ `spec.owner` — hàng
    // `users` mà `tenants.owner_user_id` trỏ tới.
  };
  const [province, ward] = await Promise.all([
    prisma.province.findUnique({
      where: { code: defaultBranch.provinceCode },
      select: { name: true },
    }),
    prisma.ward.findUnique({ where: { code: defaultBranch.wardCode }, select: { name: true } }),
  ]);
  profileFields.provinceName = province?.name ?? null;
  profileFields.wardName = ward?.name ?? null;

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
      wardCode: branch.wardCode,
      address: branch.address,
      addressLine: branch.addressLine || null,
      phone: branch.phone,
      // Địa chỉ demo khai ĐỦ hai cấp hành chính nên không có gì để rà soát — cờ này chỉ bật cho
      // dữ liệu có từ trước danh mục cấp xã.
      needsLocationReview: false,
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
  await buildWallet(spec, tenantId);
  await buildBankAccount(spec, tenantId);
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
      (isActive ? '' : ' · BỊ KHOÁ') +
      (isVerified ? '' : ' · CHƯA XÁC MINH'),
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
  /*
   * ADR 0036: "đã duyệt hồ sơ" KHÔNG còn suy ra được từ `tenants.status` — cột đó nay chỉ nói
   * gian hàng còn hoạt động hay không. Trục xác minh đọc từ chính phiếu duyệt, nên spec khai
   * tường minh bằng `verificationPending`.
   */
  const approved = !spec.verificationPending;
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

/**
 * Vài xe đã qua duyệt public — để màn "Duyệt xe" của nền tảng có dữ liệu thật.
 *
 * Mỗi phiếu kèm dòng HÌNH CHIẾU HÀNG ĐỢI (`approval_vehicle_subjects`): màn duyệt xe chỉ liệt kê
 * phiếu có dòng đó, nên thiếu nó là hàng đợi rỗng trên một DB vừa seed. Giá trị chụp từ xe seed +
 * tuyến của gian hàng (`resolveStorefrontKind`, không từ `tenant_type`).
 *
 * Phiếu seed KHÔNG mang `snapshot_json`: bộ dựng snapshot v2 sống ở API (nó cần chính sách thuê
 * hiệu lực của `PricingService`), và chép nó sang đây là một bản luật thứ hai. Màn chi tiết đọc
 * những phiếu này ở chế độ `basis = live` và NÓI RÕ điều đó — đúng như với phiếu thật gửi trước
 * 24/09/2026. Phiếu gửi qua giao diện đăng xe luôn có snapshot v2.
 */
async function buildVehicleApprovals(
  spec: ShopSpec,
  tenantId: string,
  ownerUserId: string,
  platform: PlatformAccounts,
  units: ReadonlyArray<{ id: string; code: string; approved: boolean }>,
): Promise<void> {
  const picked = units.slice(0, 6);
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: picked.map((unit) => unit.id) } },
    select: {
      id: true,
      vehicleType: true,
      name: true,
      code: true,
      plateNumber: true,
      mainImageUrl: true,
    },
  });
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const storefrontKind = resolveStorefrontKind(
    PACKAGE_PLAN_CODES.has(spec.planCode ?? '') ? BILLING_MODE.PACKAGE : null,
  );

  for (const unit of picked) {
    const vehicle = byId.get(unit.id);
    if (!vehicle) continue;
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
        // Không nhắc "giấy tờ": luồng đăng xe không thu đăng ký/đăng kiểm/bảo hiểm, nên một lý do
        // duyệt nói giấy tờ hợp lệ là bịa ra một lần kiểm tra chưa từng có.
        reason: unit.approved ? 'Ảnh rõ, thông tin xe hợp lệ.' : null,
      },
    });
    const subject = {
      vehicleId: vehicle.id,
      vehicleType: vehicle.vehicleType,
      name: vehicle.name,
      code: vehicle.code,
      plateNumber: vehicle.plateNumber,
      mainImageUrl: vehicle.mainImageUrl,
      storefrontKind,
      sourceName: spec.name,
    };
    await prisma.approvalVehicleSubject.upsert({
      where: { approvalTaskId: id },
      update: subject,
      create: { approvalTaskId: id, ...subject },
    });
  }
}

// ---------------------------------------------------------------------------
// Thuê bao gói dịch vụ
// ---------------------------------------------------------------------------

/**
 * Dòng thuê bao hiệu lực của gian hàng demo — MỘT dòng, hội tụ về bản khai ở mọi lần chạy.
 *
 * ## `update` KHÔNG rỗng, có lý do
 *
 * Bản trước dùng `update: {}`, nên seed chạy lại trên một DB đã có dữ liệu **không** sửa dòng
 * cũ. Khi ADR 0029 đổi `planCode` của gian hàng demo từ `standard` sang `per-vehicle`, mọi máy
 * dev đã seed trước đó giữ nguyên gói cũ — và đó chính là lý do bậc `standard` vẫn còn thuê bao
 * trỏ tới sau khi nó đã bị archive. Seed là NGUỒN của dữ liệu demo; một seed không hội tụ là
 * một seed nói dối về trạng thái nó tạo ra.
 *
 * ## Hai tuyến, hai kỳ hạn
 *
 * Tuyến gói: kỳ `PACKAGE_DEMO_TERM_MONTHS`, tiền = GIÁ NIÊM YẾT của kỳ đó trong bảng giá của
 * bậc (ADR 0041 điều 2) — không phép nhân nào. Bậc `salesOnly` không có bảng giá, nên dòng demo
 * của nó mang giá 0đ và một ghi chú nói rõ đó là gói cấp tay: đúng hình dạng mà
 * `BillingService.assign` ghi khi admin gán một hợp đồng đàm phán.
 *
 * Tuyến hoa hồng: `COMMISSION_TRACK_TERM_MONTHS` (12 tháng), 0đ, KHÔNG có `slots_json`. Kỳ 12
 * tháng không phải chi tiết thẩm mỹ: tuyến hoa hồng không có ngày hết hạn trong sản phẩm, và
 * dòng 12 tháng là cách kỹ thuật để điều đó đúng — job vòng đời nối dòng mới từ `ends_at` chứ
 * không từ `now` (ADR 0038 điều 1). Bản trước đặt kỳ 1 tháng và `ends_at` sau 15 ngày, nên một
 * tài khoản demo tuyến hoa hồng tự rơi vào pha `lapsed` nửa tháng sau khi seed.
 *
 * `endsAt` cộng THÁNG LỊCH (ADR 0011), không nhân 30 ngày.
 */
async function buildSubscription(
  spec: ShopSpec,
  tenantId: string,
  deps: ShopBuildDeps,
): Promise<void> {
  if (!spec.planCode) {
    /*
     * Bản khai nói "không gói" ⇒ database cũng phải nói vậy. Bỏ qua sớm mà không dọn sẽ để lại mọi
     * dòng thuê bao lạc của lần seed trước — và một gian hàng lẽ ra ở pha `unconfigured` lại mang
     * một tuyến từ đời trước.
     */
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    return;
  }
  const plan = deps.planIds.get(spec.planCode);
  if (!plan) {
    throw new Error(
      `Bản khai gian hàng "${spec.slug}" trỏ tới gói "${spec.planCode}" không có trong danh mục seed. ` +
        'Sửa `planCode` trong shops.ts hoặc thêm bậc gói đó vào PLANS.',
    );
  }

  const isPackage = plan.billingMode === BILLING_MODE.PACKAGE;
  const termMonths = isPackage ? PACKAGE_DEMO_TERM_MONTHS : COMMISSION_TRACK_TERM_MONTHS;
  const listed = plan.termPrices.find((t) => t.months === termMonths)?.price ?? null;
  const price = isPackage ? (listed ? Number(listed) : PACKAGE_DEMO_NEGOTIATED_PRICE) : 0;

  const startsAt = daysFromToday(-15, 0);
  const fields = {
    tenantId,
    planId: plan.id,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    // `price` là tiền CẢ KỲ — cùng ngữ nghĩa với `BillingService.assign` (pricing.total).
    price,
    termMonths,
    // Snapshot HẠN MỨC từ bậc gói (ADR 0041 điều 3) — cùng hình dạng dòng mà
    // BillingService.assign ghi, để dữ liệu demo không khác dữ liệu thật.
    // `DbNull` chứ không phải `null`: cột jsonb nullable, và dòng tuyến hoa hồng phải GHI ĐÈ về
    // NULL khi seed hội tụ một gian hàng từ tuyến gói về hoa hồng — bỏ khoá đi thì hạn mức cũ ở
    // lại và trở thành trần của một tenant không còn mua bậc nào.
    quotaJson: isPackage ? plan.quota : Prisma.DbNull,
    billingMode: plan.billingMode,
    commissionPercent: plan.commissionPercent,
    startsAt,
    endsAt: addCalendarMonthsVn(startsAt, termMonths),
    note:
      isPackage && !listed
        ? 'Gói cấp tay theo hợp đồng tư vấn (seed demo) — bậc này không bán tự động.'
        : 'Gói đang hiệu lực (seed demo).',
    createdBy: deps.platform.adminUserId,
  };

  const id = seedId(`${spec.key}:subscription`);
  await prisma.tenantSubscription.upsert({
    where: { id },
    update: fields,
    create: { id, ...fields },
  });

  /*
   * Dọn dòng thuê bao LẠC: gian hàng demo chỉ được có đúng dòng ở trên.
   *
   * Nguồn của chúng là đời trước của chính seed này (`update: {}` để lại dòng cũ) và những lần
   * bấm thử "mua gói"/"gán gói" trên máy dev. Nhiều dòng `active` cùng lúc phá đúng bất biến mà
   * `findCurrent`/`resolveEffectiveBilling` dựa vào ("MỘT dòng hiệu lực tại một thời điểm"), và
   * triệu chứng là tuyến của một tài khoản QA đổi theo dòng nào có `ends_at` lớn hơn.
   *
   * `deleteMany` chứ không lật `cancelled`: đây là dữ liệu demo do seed sở hữu, không phải lịch
   * sử của một khách hàng thật. Hoá đơn gói KHÔNG trỏ FK sang `tenant_subscriptions` (ADR 0022
   * điều 6 cấm nối FK đó), nên không có gì mồ côi.
   */
  await prisma.tenantSubscription.deleteMany({ where: { tenantId, id: { not: id } } });
}

// ---------------------------------------------------------------------------
// Ví điểm của gian hàng
// ---------------------------------------------------------------------------

/**
 * MỘT ví cho một người, và với chủ xe thì ví thuộc TENANT (ADR 0038 điều 2).
 *
 * Seed dựng sẵn vỏ ví với số dư 0 và KHÔNG một bút toán nào — đúng thứ mà
 * `WalletService.ensureWalletWithinTx` sẽ tạo ở đồng tiền đầu tiên. Lý do dựng sẵn thay vì đợi:
 * màn "Ví điểm" và "Tài khoản nhận tiền" của chủ xe phải mở được ngay trên tài khoản QA, và câu
 * hỏi kiểm chứng là "người này có ĐÚNG MỘT ví, thuộc tenant" — một bảng rỗng không trả lời được
 * câu đó.
 *
 * KHÔNG cộng điểm khuyến mãi: `wallets.balance` là sổ CÔNG NỢ PHẢI TRẢ (ADR 0033 điều 1), và
 * một số dư seed không có bút toán đối ứng là tiền từ hư không trong một sổ phải đối soát được.
 */
async function buildWallet(spec: ShopSpec, tenantId: string): Promise<void> {
  const existing = await prisma.wallet.findUnique({
    where: { ownerTenantId: tenantId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.wallet.create({
    data: {
      id: seedId(`${spec.key}:wallet`),
      ownerType: WALLET_OWNER_TYPE.TENANT,
      ownerTenantId: tenantId,
      status: WALLET_STATUS.ACTIVE,
    },
  });
}
/**
 * Tài khoản nhận tiền MẶC ĐỊNH của gian hàng — `bank_accounts`, nguồn duy nhất (ADR 0033).
 *
 * Trước 16/09/2026 bản khai này đổ vào bốn cột text trên `tenant_profiles`, nên dữ liệu demo có
 * một gian hàng "đã khai tài khoản" mà màn rút tiền vẫn nói "chưa có tài khoản nào" — hai bảng,
 * hai câu trả lời. Nay chỉ còn một.
 *
 * `bank.name` trong bản khai là TÊN ngân hàng ("Techcombank"); cột `bank_code` cần mã VietQR,
 * nên tra qua `BANK_CODE_BY_NAME`. Tên không có trong bảng thì rơi về chính nó viết hoa — dữ
 * liệu demo vẫn dựng được, chỉ là QR của nó không quét ra.
 */
async function buildBankAccount(spec: ShopSpec, tenantId: string): Promise<void> {
  if (!spec.profile.bank) return;
  const { name, accountNo, accountName } = spec.profile.bank;
  const id = seedId(`${spec.key}:bank-account`);
  const fields = {
    bankCode: BANK_CODE_BY_NAME[name] ?? name.toUpperCase(),
    accountNumber: accountNo,
    accountName,
    label: name,
    isDefault: true,
    status: BANK_ACCOUNT_STATUS.ACTIVE,
  };
  await prisma.bankAccount.upsert({
    where: { id },
    update: fields,
    create: {
      id,
      ownerType: WALLET_OWNER_TYPE.TENANT,
      ownerTenantId: tenantId,
      ...fields,
    },
  });
}

/** Tên ngân hàng trong bản khai demo → mã VietQR (cùng bộ mã với SePay và QR thanh toán). */
const BANK_CODE_BY_NAME: Record<string, string> = {
  ACB: 'ACB',
  Agribank: 'AGRIBANK',
  BIDV: 'BIDV',
  'MB Bank': 'MB',
  Sacombank: 'SACOMBANK',
  Techcombank: 'TCB',
  VPBank: 'VPB',
  Vietcombank: 'VCB',
  VietinBank: 'ICB',
};

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
