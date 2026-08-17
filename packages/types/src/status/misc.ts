import { STATUS_COLOR, type StatusMeta } from './meta';

/** Trạng thái task duyệt (dùng chung cho duyệt shop / duyệt xe / duyệt giấy tờ). */
export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NEEDS_REVISION: 'needs_revision',
  CANCELLED: 'cancelled',
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];
export const APPROVAL_STATUS_VALUES = Object.values(APPROVAL_STATUS) as ApprovalStatus[];

export const APPROVAL_STATUS_META: Readonly<Record<ApprovalStatus, StatusMeta>> = {
  [APPROVAL_STATUS.PENDING]: { label: 'Chờ duyệt', color: STATUS_COLOR.WAITING },
  [APPROVAL_STATUS.APPROVED]: { label: 'Đã duyệt', color: STATUS_COLOR.SUCCESS },
  [APPROVAL_STATUS.REJECTED]: { label: 'Từ chối', color: STATUS_COLOR.DANGER },
  [APPROVAL_STATUS.NEEDS_REVISION]: {
    label: 'Yêu cầu bổ sung',
    color: STATUS_COLOR.WARNING,
  },
  [APPROVAL_STATUS.CANCELLED]: { label: 'Đã hủy', color: STATUS_COLOR.NEUTRAL },
};

/** Đối tượng được duyệt. */
export const APPROVAL_TARGET_TYPE = {
  TENANT: 'tenant',
  VEHICLE: 'vehicle',
  TENANT_DOCUMENT: 'tenant_document',
  VEHICLE_DOCUMENT: 'vehicle_document',
} as const;

export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPE)[keyof typeof APPROVAL_TARGET_TYPE];
export const APPROVAL_TARGET_TYPE_VALUES = Object.values(
  APPROVAL_TARGET_TYPE,
) as ApprovalTargetType[];

/** Trạng thái listing công khai trên Marketplace (ADR 0008 / database_design §9.9). */
export const LISTING_STATUS = {
  ACTIVE: 'active',
  HIDDEN: 'hidden',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];
export const LISTING_STATUS_VALUES = Object.values(LISTING_STATUS) as ListingStatus[];

export const LISTING_STATUS_META: Readonly<Record<ListingStatus, StatusMeta>> = {
  [LISTING_STATUS.ACTIVE]: { label: 'Đang hiển thị', color: STATUS_COLOR.SUCCESS },
  [LISTING_STATUS.HIDDEN]: { label: 'Đã ẩn', color: STATUS_COLOR.NEUTRAL },
  [LISTING_STATUS.SUSPENDED]: { label: 'Tạm ngưng', color: STATUS_COLOR.WARNING },
  [LISTING_STATUS.ARCHIVED]: { label: 'Đã lưu trữ', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Sắp xếp danh sách marketplace — dùng chung cho query DTO của `/public/listings` (BE) và
 * chip/select sắp xếp (FE), tránh 2 bản chép tay lệch nhau.
 *
 * `recommended` (mặc định): rating cao trước (NULLS LAST) → nhiều đánh giá trước → mới trước.
 */
export const LISTING_SORT_VALUES = ['recommended', 'newest', 'price_asc', 'price_desc'] as const;

export type ListingSort = (typeof LISTING_SORT_VALUES)[number];

export const DEFAULT_LISTING_SORT: ListingSort = 'recommended';

export const LISTING_SORT_LABEL: Readonly<Record<ListingSort, string>> = {
  recommended: 'Gợi ý',
  newest: 'Mới nhất',
  price_asc: 'Giá thấp → cao',
  price_desc: 'Giá cao → thấp',
};

/** Trạng thái phiếu thu/chi. */
export const RECEIPT_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
} as const;

export type ReceiptStatus = (typeof RECEIPT_STATUS)[keyof typeof RECEIPT_STATUS];
export const RECEIPT_STATUS_VALUES = Object.values(RECEIPT_STATUS) as ReceiptStatus[];

export const RECEIPT_STATUS_META: Readonly<Record<ReceiptStatus, StatusMeta>> = {
  [RECEIPT_STATUS.DRAFT]: { label: 'Nháp', color: STATUS_COLOR.NEUTRAL },
  [RECEIPT_STATUS.PENDING_APPROVAL]: { label: 'Chờ duyệt', color: STATUS_COLOR.WAITING },
  [RECEIPT_STATUS.APPROVED]: { label: 'Đã duyệt', color: STATUS_COLOR.SUCCESS },
  [RECEIPT_STATUS.CANCELLED]: { label: 'Đã hủy', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái hội thoại chat. */
export const CONVERSATION_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  FLAGGED: 'flagged',
  ARCHIVED: 'archived',
} as const;

export type ConversationStatus = (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];
export const CONVERSATION_STATUS_VALUES = Object.values(
  CONVERSATION_STATUS,
) as ConversationStatus[];

export const CONVERSATION_STATUS_META: Readonly<Record<ConversationStatus, StatusMeta>> = {
  [CONVERSATION_STATUS.OPEN]: { label: 'Đang mở', color: STATUS_COLOR.PROCESSING },
  [CONVERSATION_STATUS.CLOSED]: { label: 'Đã đóng', color: STATUS_COLOR.NEUTRAL },
  [CONVERSATION_STATUS.FLAGGED]: { label: 'Cần xem xét', color: STATUS_COLOR.DANGER },
  [CONVERSATION_STATUS.ARCHIVED]: { label: 'Đã lưu trữ', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái gói dịch vụ trong danh mục (ADR 0010). Archived = ngừng bán, thuê bao cũ giữ nguyên. */
export const PLAN_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];
export const PLAN_STATUS_VALUES = Object.values(PLAN_STATUS) as PlanStatus[];

export const PLAN_STATUS_META: Readonly<Record<PlanStatus, StatusMeta>> = {
  [PLAN_STATUS.ACTIVE]: { label: 'Đang bán', color: STATUS_COLOR.SUCCESS },
  [PLAN_STATUS.ARCHIVED]: { label: 'Ngừng bán', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Trạng thái gói thuê bao của gian hàng.
 *
 * ADR 0010: dòng `tenant_subscriptions` chỉ LƯU `active | cancelled`; `expired` suy ra từ
 * `ends_at < now()` lúc đọc (không job lật status). `trial`/`past_due` để dành cho sau.
 */
export const SUBSCRIPTION_STATUS = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];
export const SUBSCRIPTION_STATUS_VALUES = Object.values(
  SUBSCRIPTION_STATUS,
) as SubscriptionStatus[];

export const SUBSCRIPTION_STATUS_META: Readonly<Record<SubscriptionStatus, StatusMeta>> = {
  [SUBSCRIPTION_STATUS.TRIAL]: { label: 'Dùng thử', color: STATUS_COLOR.PROCESSING },
  [SUBSCRIPTION_STATUS.ACTIVE]: { label: 'Đang hiệu lực', color: STATUS_COLOR.SUCCESS },
  [SUBSCRIPTION_STATUS.PAST_DUE]: {
    label: 'Quá hạn thanh toán',
    color: STATUS_COLOR.WARNING,
  },
  [SUBSCRIPTION_STATUS.EXPIRED]: { label: 'Hết hạn', color: STATUS_COLOR.DANGER },
  [SUBSCRIPTION_STATUS.CANCELLED]: { label: 'Đã hủy', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái tài khoản người dùng. */
export const USER_STATUS = {
  ACTIVE: 'active',
  LOCKED: 'locked',
  DELETED: 'deleted',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export const USER_STATUS_VALUES = Object.values(USER_STATUS) as UserStatus[];

export const USER_STATUS_META: Readonly<Record<UserStatus, StatusMeta>> = {
  [USER_STATUS.ACTIVE]: { label: 'Đang hoạt động', color: STATUS_COLOR.SUCCESS },
  [USER_STATUS.LOCKED]: { label: 'Bị khoá', color: STATUS_COLOR.DANGER },
  [USER_STATUS.DELETED]: { label: 'Đã xoá', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái membership (tenant lẫn platform). */
export const MEMBERSHIP_STATUS = {
  ACTIVE: 'active',
  INVITED: 'invited',
  LOCKED: 'locked',
  REMOVED: 'removed',
} as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];
export const MEMBERSHIP_STATUS_VALUES = Object.values(MEMBERSHIP_STATUS) as MembershipStatus[];

/** Phạm vi người thao tác trong `audit_logs` (AuditEntry.actorScope). */
export const AUDIT_ACTOR_SCOPE = {
  TENANT: 'tenant',
  PLATFORM: 'platform',
  SYSTEM: 'system',
} as const;

export type AuditActorScope = (typeof AUDIT_ACTOR_SCOPE)[keyof typeof AUDIT_ACTOR_SCOPE];
export const AUDIT_ACTOR_SCOPE_VALUES = Object.values(AUDIT_ACTOR_SCOPE) as AuditActorScope[];

export const AUDIT_ACTOR_SCOPE_META: Readonly<Record<AuditActorScope, StatusMeta>> = {
  [AUDIT_ACTOR_SCOPE.TENANT]: { label: 'Gian hàng', color: STATUS_COLOR.INFO },
  [AUDIT_ACTOR_SCOPE.PLATFORM]: { label: 'Nền tảng', color: STATUS_COLOR.SPECIAL },
  [AUDIT_ACTOR_SCOPE.SYSTEM]: { label: 'Hệ thống', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Nguồn chiếm dụng lịch xe (ADR 0006).
 *
 * Mọi thứ chiếm chỗ trên lịch — đơn thuê, khoá xe, bảo dưỡng — đều ghi vào cùng một bảng
 * `vehicle_occupancies`, để exclusion constraint của Postgres chặn được xung đột GIỮA các
 * nguồn, không chỉ trong cùng một nguồn.
 */
export const OCCUPANCY_SOURCE_TYPE = {
  BOOKING: 'booking',
  BLOCKED_RANGE: 'blocked_range',
  MAINTENANCE: 'maintenance',
} as const;

export type OccupancySourceType =
  (typeof OCCUPANCY_SOURCE_TYPE)[keyof typeof OCCUPANCY_SOURCE_TYPE];
export const OCCUPANCY_SOURCE_TYPE_VALUES = Object.values(
  OCCUPANCY_SOURCE_TYPE,
) as OccupancySourceType[];

export const OCCUPANCY_SOURCE_TYPE_META: Readonly<Record<OccupancySourceType, StatusMeta>> = {
  [OCCUPANCY_SOURCE_TYPE.BOOKING]: { label: 'Đơn thuê', color: STATUS_COLOR.INFO },
  [OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE]: {
    label: 'Xe bị khóa',
    color: STATUS_COLOR.NEUTRAL,
  },
  [OCCUPANCY_SOURCE_TYPE.MAINTENANCE]: { label: 'Bảo dưỡng', color: STATUS_COLOR.SPECIAL },
};

/**
 * Lý do khoá xe thủ công (`vehicle_blocks`) — nguồn `blocked_range` của lịch xe.
 *
 * Khác với phiếu bảo dưỡng (`vehicle_maintenance_records`, có vòng đời riêng), khoá xe là một
 * khoảng "không cho thuê" đơn thuần: tạo là giữ chỗ, xoá là nhả chỗ, không có trạng thái
 * trung gian. `UNPLANNED_MAINTENANCE` dành cho việc sửa gấp chưa kịp lập phiếu.
 */
export const VEHICLE_BLOCK_REASON = {
  UNPLANNED_MAINTENANCE: 'unplanned_maintenance',
  REPAIR: 'repair',
  INTERNAL_USE: 'internal_use',
  NOT_FOR_RENT: 'not_for_rent',
  OTHER: 'other',
} as const;

export type VehicleBlockReason = (typeof VEHICLE_BLOCK_REASON)[keyof typeof VEHICLE_BLOCK_REASON];
export const VEHICLE_BLOCK_REASON_VALUES = Object.values(
  VEHICLE_BLOCK_REASON,
) as VehicleBlockReason[];

export const VEHICLE_BLOCK_REASON_META: Readonly<Record<VehicleBlockReason, StatusMeta>> = {
  [VEHICLE_BLOCK_REASON.UNPLANNED_MAINTENANCE]: {
    label: 'Bảo dưỡng ngoài kế hoạch',
    color: STATUS_COLOR.SPECIAL,
  },
  [VEHICLE_BLOCK_REASON.REPAIR]: { label: 'Sửa chữa', color: STATUS_COLOR.WARNING },
  [VEHICLE_BLOCK_REASON.INTERNAL_USE]: {
    label: 'Xe đang sử dụng nội bộ',
    color: STATUS_COLOR.INFO,
  },
  [VEHICLE_BLOCK_REASON.NOT_FOR_RENT]: {
    label: 'Không cho thuê',
    color: STATUS_COLOR.DANGER,
  },
  [VEHICLE_BLOCK_REASON.OTHER]: { label: 'Khác', color: STATUS_COLOR.NEUTRAL },
};
