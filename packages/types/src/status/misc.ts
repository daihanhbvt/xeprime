import type { StatusMeta } from './meta';

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
  [APPROVAL_STATUS.PENDING]: { label: 'Chờ duyệt', color: 'gold' },
  [APPROVAL_STATUS.APPROVED]: { label: 'Đã duyệt', color: 'green' },
  [APPROVAL_STATUS.REJECTED]: { label: 'Từ chối', color: 'red' },
  [APPROVAL_STATUS.NEEDS_REVISION]: { label: 'Yêu cầu bổ sung', color: 'orange' },
  [APPROVAL_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'default' },
};

/** Đối tượng được duyệt. */
export const APPROVAL_TARGET_TYPE = {
  TENANT: 'tenant',
  VEHICLE: 'vehicle',
  TENANT_DOCUMENT: 'tenant_document',
  VEHICLE_DOCUMENT: 'vehicle_document',
} as const;

export type ApprovalTargetType =
  (typeof APPROVAL_TARGET_TYPE)[keyof typeof APPROVAL_TARGET_TYPE];
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
  [LISTING_STATUS.ACTIVE]: { label: 'Đang hiển thị', color: 'green' },
  [LISTING_STATUS.HIDDEN]: { label: 'Đã ẩn', color: 'default' },
  [LISTING_STATUS.SUSPENDED]: { label: 'Tạm ngưng', color: 'orange' },
  [LISTING_STATUS.ARCHIVED]: { label: 'Đã lưu trữ', color: 'default' },
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
  [RECEIPT_STATUS.DRAFT]: { label: 'Nháp', color: 'default' },
  [RECEIPT_STATUS.PENDING_APPROVAL]: { label: 'Chờ duyệt', color: 'gold' },
  [RECEIPT_STATUS.APPROVED]: { label: 'Đã duyệt', color: 'green' },
  [RECEIPT_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'default' },
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
  [CONVERSATION_STATUS.OPEN]: { label: 'Đang mở', color: 'green' },
  [CONVERSATION_STATUS.CLOSED]: { label: 'Đã đóng', color: 'default' },
  [CONVERSATION_STATUS.FLAGGED]: { label: 'Cần xem xét', color: 'red' },
  [CONVERSATION_STATUS.ARCHIVED]: { label: 'Đã lưu trữ', color: 'default' },
};

/** Trạng thái gói thuê bao của gian hàng. */
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
  [SUBSCRIPTION_STATUS.TRIAL]: { label: 'Dùng thử', color: 'cyan' },
  [SUBSCRIPTION_STATUS.ACTIVE]: { label: 'Đang hiệu lực', color: 'green' },
  [SUBSCRIPTION_STATUS.PAST_DUE]: { label: 'Quá hạn thanh toán', color: 'orange' },
  [SUBSCRIPTION_STATUS.EXPIRED]: { label: 'Hết hạn', color: 'red' },
  [SUBSCRIPTION_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'default' },
};

/** Trạng thái tài khoản người dùng. */
export const USER_STATUS = {
  ACTIVE: 'active',
  LOCKED: 'locked',
  DELETED: 'deleted',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export const USER_STATUS_VALUES = Object.values(USER_STATUS) as UserStatus[];

/** Trạng thái membership (tenant lẫn platform). */
export const MEMBERSHIP_STATUS = {
  ACTIVE: 'active',
  INVITED: 'invited',
  LOCKED: 'locked',
  REMOVED: 'removed',
} as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];
export const MEMBERSHIP_STATUS_VALUES = Object.values(MEMBERSHIP_STATUS) as MembershipStatus[];

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
  [OCCUPANCY_SOURCE_TYPE.BOOKING]: { label: 'Đơn thuê', color: 'blue' },
  [OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE]: { label: 'Xe bị khóa', color: 'default' },
  [OCCUPANCY_SOURCE_TYPE.MAINTENANCE]: { label: 'Bảo dưỡng', color: 'purple' },
};
