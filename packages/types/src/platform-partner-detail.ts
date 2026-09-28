/**
 * Màn CHI TIẾT đối tác ở Platform Admin — drawer CHỈ ĐỌC (28/09/2026).
 *
 * Một vỏ dùng chung cho hai biến thể (`PLATFORM_PARTNER_KIND`); khác nhau ở bộ tab và vài khối,
 * cấu hình ở đây để API (lọc nhóm nhật ký theo loại) và web (dựng tab) đọc CÙNG một bảng.
 *
 * Nguyên tắc chỉ đọc: mọi thay đổi dữ liệu của đối tác đi qua phiên hỗ trợ (ADR 0050). Drawer
 * không gọi endpoint ghi nào — ngoại lệ có chủ đích duy nhất là hai thao tác QUẢN TRỊ NỀN TẢNG đã
 * có từ trước (khoá/mở khoá gian hàng, gán/huỷ gói), vì phiên hỗ trợ cấm cả hai và chúng không
 * còn chỗ nào khác trên web.
 */

import { PLATFORM_PARTNER_KIND, type PlatformPartnerKind } from './platform-partner';

export const PARTNER_DETAIL_TAB = {
  OVERVIEW: 'overview',
  VEHICLES: 'vehicles',
  BOOKINGS: 'bookings',
  PROFILE: 'profile',
  /** Gian hàng gói: gói, hạn mức, hoá đơn. */
  BILLING: 'billing',
  /** Chủ xe cá nhân: phí dịch vụ theo chuyến và số liệu theo tháng. */
  COMMISSION: 'commission',
  ACTIVITY: 'activity',
} as const;

export type PartnerDetailTab = (typeof PARTNER_DETAIL_TAB)[keyof typeof PARTNER_DETAIL_TAB];

/** Sáu tab của mỗi biến thể, đúng thứ tự hiển thị. */
export const PARTNER_DETAIL_TABS: Readonly<
  Record<PlatformPartnerKind, readonly PartnerDetailTab[]>
> = {
  [PLATFORM_PARTNER_KIND.PACKAGE_SHOP]: [
    PARTNER_DETAIL_TAB.OVERVIEW,
    PARTNER_DETAIL_TAB.VEHICLES,
    PARTNER_DETAIL_TAB.BOOKINGS,
    PARTNER_DETAIL_TAB.PROFILE,
    PARTNER_DETAIL_TAB.BILLING,
    PARTNER_DETAIL_TAB.ACTIVITY,
  ],
  [PLATFORM_PARTNER_KIND.INDIVIDUAL_OWNER]: [
    PARTNER_DETAIL_TAB.OVERVIEW,
    PARTNER_DETAIL_TAB.VEHICLES,
    PARTNER_DETAIL_TAB.BOOKINGS,
    PARTNER_DETAIL_TAB.PROFILE,
    PARTNER_DETAIL_TAB.COMMISSION,
    PARTNER_DETAIL_TAB.ACTIVITY,
  ],
};

/** Tab hợp lệ của một biến thể; giá trị lạ (link cũ, gõ tay, đổi loại) rơi về Tổng quan. */
export function partnerDetailTabOf(
  kind: PlatformPartnerKind,
  value: string | null | undefined,
): PartnerDetailTab {
  const tabs = PARTNER_DETAIL_TABS[kind];
  return (tabs as readonly string[]).includes(value ?? '')
    ? (value as PartnerDetailTab)
    : PARTNER_DETAIL_TAB.OVERVIEW;
}

/** Sắp xếp danh sách xe trong drawer — server-side, trước phân trang. */
export const PARTNER_VEHICLE_SORT = {
  UPDATED: 'updated',
  NEWEST: 'newest',
  NAME: 'name',
} as const;

export type PartnerVehicleSort = (typeof PARTNER_VEHICLE_SORT)[keyof typeof PARTNER_VEHICLE_SORT];

export const PARTNER_VEHICLE_SORT_VALUES = Object.values(
  PARTNER_VEHICLE_SORT,
) as PartnerVehicleSort[];

export const DEFAULT_PARTNER_VEHICLE_SORT: PartnerVehicleSort = PARTNER_VEHICLE_SORT.UPDATED;

/**
 * Cửa sổ "sắp đến giờ nhận xe" của cảnh báo trên tab Đơn thuê — giờ, tính từ lúc đọc.
 *
 * Chỉ là lời nhắc cho người trực nền tảng, không phải luật vận hành: `pickupUrgency` của hàng
 * đợi giao xe cố ý không có ngưỡng giờ, nên hằng này đứng riêng thay vì mượn luật đó.
 */
export const PARTNER_PICKUP_SOON_HOURS = 2;

/** Số tháng ở bảng số liệu theo tháng của tab Hoa hồng & đối soát (gồm tháng hiện tại). */
export const PARTNER_COMMISSION_MONTHS = 6;

/**
 * Nhóm hành động của nhật ký — nhãn thân thiện ở danh sách, và là bộ lọc "Hành động".
 *
 * Nhóm suy từ TIỀN TỐ của mã hành động (`vehicle.document.create` → `vehicle_document`), nên một
 * hành động mới tự rơi vào đúng nhóm mà không phải khai lại ở đây. Mã kỹ thuật vẫn đi kèm để
 * trang Nhật ký hệ thống hiện chi tiết.
 */
export const AUDIT_ACTION_CATEGORY = {
  VEHICLE: 'vehicle',
  VEHICLE_DOCUMENT: 'vehicle_document',
  MAINTENANCE: 'maintenance',
  BOOKING: 'booking',
  BOOKING_REQUEST: 'booking_request',
  FINANCE: 'finance',
  BRANCH: 'branch',
  MEMBER: 'member',
  SUBSCRIPTION: 'subscription',
  PROFILE: 'profile',
  /** Quyết định của NỀN TẢNG về trạng thái đối tác (khoá / mở khoá) — không phải sửa hồ sơ. */
  PARTNER_STATUS: 'partner_status',
  CUSTOMER: 'customer',
  SUPPORT_SESSION: 'support_session',
  SUPPORT_CASE: 'support_case',
  OTHER: 'other',
} as const;

export type AuditActionCategory =
  (typeof AUDIT_ACTION_CATEGORY)[keyof typeof AUDIT_ACTION_CATEGORY];

export const AUDIT_ACTION_CATEGORY_VALUES = Object.values(
  AUDIT_ACTION_CATEGORY,
) as AuditActionCategory[];

export function isAuditActionCategory(value: unknown): value is AuditActionCategory {
  return (AUDIT_ACTION_CATEGORY_VALUES as unknown[]).includes(value);
}

/**
 * Tiền tố → nhóm. Thứ tự QUAN TRỌNG: tiền tố cụ thể đứng trước tiền tố chung
 * (`vehicle.document.` trước `vehicle.`), hàm tra lấy khớp ĐẦU TIÊN.
 */
export const AUDIT_ACTION_CATEGORY_PREFIXES: ReadonlyArray<
  readonly [prefix: string, category: AuditActionCategory]
> = [
  ['vehicle.document.', AUDIT_ACTION_CATEGORY.VEHICLE_DOCUMENT],
  ['vehicle.maintenance.', AUDIT_ACTION_CATEGORY.MAINTENANCE],
  ['vehicle.', AUDIT_ACTION_CATEGORY.VEHICLE],
  ['listing.', AUDIT_ACTION_CATEGORY.VEHICLE],
  ['booking_request.', AUDIT_ACTION_CATEGORY.BOOKING_REQUEST],
  ['booking_hold.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['hold_refund.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['receipt.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['payment.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['withdrawal.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['tax_withholding.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['tax_period.', AUDIT_ACTION_CATEGORY.FINANCE],
  ['booking.', AUDIT_ACTION_CATEGORY.BOOKING],
  ['contract.', AUDIT_ACTION_CATEGORY.BOOKING],
  ['branch.', AUDIT_ACTION_CATEGORY.BRANCH],
  ['member.', AUDIT_ACTION_CATEGORY.MEMBER],
  ['driver.', AUDIT_ACTION_CATEGORY.MEMBER],
  ['subscription_invoice.', AUDIT_ACTION_CATEGORY.SUBSCRIPTION],
  ['subscription.', AUDIT_ACTION_CATEGORY.SUBSCRIPTION],
  ['tenant_support.', AUDIT_ACTION_CATEGORY.SUPPORT_SESSION],
  ['support_case.', AUDIT_ACTION_CATEGORY.SUPPORT_CASE],
  ['tenant_customer.', AUDIT_ACTION_CATEGORY.CUSTOMER],
  ['customer.', AUDIT_ACTION_CATEGORY.CUSTOMER],
  ['tenant_payment_settings.', AUDIT_ACTION_CATEGORY.PROFILE],
  ['seller_profile.', AUDIT_ACTION_CATEGORY.PROFILE],
  ['rental_policy.', AUDIT_ACTION_CATEGORY.PROFILE],
  // Khoá/mở khoá đứng TRƯỚC `tenant.` — cụ thể trước chung.
  ['tenant.lock', AUDIT_ACTION_CATEGORY.PARTNER_STATUS],
  ['tenant.unlock', AUDIT_ACTION_CATEGORY.PARTNER_STATUS],
  ['tenant.', AUDIT_ACTION_CATEGORY.PROFILE],
];

export function auditActionCategoryOf(action: string): AuditActionCategory {
  for (const [prefix, category] of AUDIT_ACTION_CATEGORY_PREFIXES) {
    if (action.startsWith(prefix)) return category;
  }
  return AUDIT_ACTION_CATEGORY.OTHER;
}

/**
 * Nhóm KHÔNG áp dụng cho chủ xe cá nhân — chi nhánh, nhân sự, gói thuê bao là khái niệm của gian
 * hàng. Server loại chúng khỏi nhật ký của chủ xe cá nhân, web loại khỏi bộ lọc.
 */
export const AUDIT_CATEGORIES_EXCLUDED_FOR_INDIVIDUAL: readonly AuditActionCategory[] = [
  AUDIT_ACTION_CATEGORY.BRANCH,
  AUDIT_ACTION_CATEGORY.MEMBER,
  AUDIT_ACTION_CATEGORY.SUBSCRIPTION,
];

/** Nhóm tiền — chỉ người có quyền vận hành tiền của nền tảng mới thấy trong nhật ký đối tác. */
export const AUDIT_CATEGORIES_REQUIRING_MONEY: readonly AuditActionCategory[] = [
  AUDIT_ACTION_CATEGORY.FINANCE,
];

/** Nhóm nhật ký của một loại đối tác mà người xem được phép thấy. */
export function auditCategoriesFor(
  kind: PlatformPartnerKind,
  options: { canViewMoney: boolean },
): AuditActionCategory[] {
  return AUDIT_ACTION_CATEGORY_VALUES.filter(
    (category) =>
      (kind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP ||
        !AUDIT_CATEGORIES_EXCLUDED_FOR_INDIVIDUAL.includes(category)) &&
      (options.canViewMoney || !AUDIT_CATEGORIES_REQUIRING_MONEY.includes(category)),
  );
}

/** Trạng thái một phiên hỗ trợ nhìn từ nhật ký — suy từ mốc thời gian, không lưu. */
export const SUPPORT_SESSION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export type SupportSessionStatus =
  (typeof SUPPORT_SESSION_STATUS)[keyof typeof SUPPORT_SESSION_STATUS];

export const SUPPORT_SESSION_STATUS_VALUES = Object.values(
  SUPPORT_SESSION_STATUS,
) as SupportSessionStatus[];

export function supportSessionStatusOf(
  session: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): SupportSessionStatus {
  if (session.revokedAt) return SUPPORT_SESSION_STATUS.REVOKED;
  return session.expiresAt.getTime() > now.getTime()
    ? SUPPORT_SESSION_STATUS.ACTIVE
    : SUPPORT_SESSION_STATUS.EXPIRED;
}

/**
 * Hình dạng một hạn mức ở drawer — BA trạng thái, không gộp vào `number | null`.
 *
 * `null` một mình không phân biệt được "không giới hạn" với "không áp dụng" (chủ xe hoa hồng không
 * có trần chi nhánh vì nhiều chi nhánh là cờ năng lực, không phải con số — `branchQuotaFor`), và gộp
 * hai nghĩa đó là cách một gian hàng hết gói hiện "không giới hạn" trong khi backend chặn ở 3 xe.
 */
export const PARTNER_QUOTA_KIND = {
  /** Có trần — `limit` là con số đang được CƯỠNG CHẾ. */
  TOTAL: 'total',
  UNLIMITED: 'unlimited',
  /** Tuyến/bậc hiện tại không có khái niệm này. */
  NOT_APPLICABLE: 'not_applicable',
} as const;

export type PartnerQuotaKind = (typeof PARTNER_QUOTA_KIND)[keyof typeof PARTNER_QUOTA_KIND];

export const PARTNER_QUOTA_KIND_VALUES = Object.values(PARTNER_QUOTA_KIND) as PartnerQuotaKind[];

/** Vì sao trần xe là con số đó — cùng ba lý do `BillingService.vehicleQuotaFor` trả về. */
export const QUOTA_LIMIT_REASON = {
  PLAN: 'plan',
  OWNER_LITE: 'owner_lite',
  BILLING_UNCONFIGURED: 'billing_unconfigured',
} as const;

export type QuotaLimitReason = (typeof QUOTA_LIMIT_REASON)[keyof typeof QUOTA_LIMIT_REASON];

export const QUOTA_LIMIT_REASON_VALUES = Object.values(QUOTA_LIMIT_REASON) as QuotaLimitReason[];
