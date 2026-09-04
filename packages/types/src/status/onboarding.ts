import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Status cho nhóm bảng Auth/Tenant/Approval (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §4.3, §5.3, §5.5, §7. Bổ sung cùng lúc với 7 bảng nền
 * để cột `String` trong DB luôn có union chặn ở TypeScript.
 */

// --- phone_verifications (§4.3) ---
export const PHONE_VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  EXPIRED: 'expired',
  FAILED: 'failed',
} as const;
export type PhoneVerificationStatus =
  (typeof PHONE_VERIFICATION_STATUS)[keyof typeof PHONE_VERIFICATION_STATUS];
export const PHONE_VERIFICATION_STATUS_VALUES = Object.values(
  PHONE_VERIFICATION_STATUS,
) as PhoneVerificationStatus[];

/**
 * Thời điểm bắt xác thực SĐT (user_flow: chỉ bắt khi đặt xe / mở shop / public xe).
 * `login` = passwordless: OTP vừa xác thực SĐT vừa là phương thức đăng nhập (tạo/đăng nhập
 * tài khoản theo SĐT). OTP của mục đích này KHÔNG dùng chéo cho mục đích khác.
 */
export const PHONE_VERIFICATION_PURPOSE = {
  BOOKING: 'booking',
  LOGIN: 'login',
  SHOP_REGISTER: 'shop_register',
  VEHICLE_PUBLIC: 'vehicle_public',
  PASSWORD_RESET: 'password_reset',
} as const;
export type PhoneVerificationPurpose =
  (typeof PHONE_VERIFICATION_PURPOSE)[keyof typeof PHONE_VERIFICATION_PURPOSE];
export const PHONE_VERIFICATION_PURPOSE_VALUES = Object.values(
  PHONE_VERIFICATION_PURPOSE,
) as PhoneVerificationPurpose[];

// --- tenant_documents (§5.3) ---
export const DOCUMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];
export const DOCUMENT_STATUS_VALUES = Object.values(DOCUMENT_STATUS) as DocumentStatus[];

export const DOCUMENT_STATUS_META: Readonly<Record<DocumentStatus, StatusMeta>> = {
  [DOCUMENT_STATUS.PENDING]: { label: 'Chờ duyệt', color: STATUS_COLOR.WAITING },
  [DOCUMENT_STATUS.APPROVED]: { label: 'Đã duyệt', color: STATUS_COLOR.SUCCESS },
  [DOCUMENT_STATUS.REJECTED]: { label: 'Từ chối', color: STATUS_COLOR.DANGER },
};

export const TENANT_DOCUMENT_TYPE = {
  CCCD_FRONT: 'cccd_front',
  CCCD_BACK: 'cccd_back',
  BUSINESS_LICENSE: 'business_license',
  CONTRACT: 'contract',
  OTHER: 'other',
} as const;
export type TenantDocumentType = (typeof TENANT_DOCUMENT_TYPE)[keyof typeof TENANT_DOCUMENT_TYPE];
export const TENANT_DOCUMENT_TYPE_VALUES = Object.values(
  TENANT_DOCUMENT_TYPE,
) as TenantDocumentType[];

// --- tenant_invites (§5.5) ---
export const INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  /**
   * Người được mời TỰ từ chối.
   *
   * Tách hẳn khỏi `revoked` (gian hàng rút lời mời) dù cả hai đều kết thúc lời mời: gian hàng
   * cần biết ai đã trả lời "không" để đừng mời lại người đó, còn `revoked` là quyết định của
   * chính họ. Gộp hai thứ lại thì danh sách mời không trả lời được câu hỏi nào trong hai.
   */
  DECLINED: 'declined',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;
export type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];
export const INVITE_STATUS_VALUES = Object.values(INVITE_STATUS) as InviteStatus[];

export const INVITE_STATUS_META: Readonly<Record<InviteStatus, StatusMeta>> = {
  [INVITE_STATUS.PENDING]: { label: 'Đang chờ', color: STATUS_COLOR.WAITING },
  [INVITE_STATUS.ACCEPTED]: { label: 'Đã tham gia', color: STATUS_COLOR.SUCCESS },
  [INVITE_STATUS.DECLINED]: { label: 'Đã từ chối', color: STATUS_COLOR.DANGER },
  [INVITE_STATUS.EXPIRED]: { label: 'Hết hạn', color: STATUS_COLOR.NEUTRAL },
  [INVITE_STATUS.REVOKED]: { label: 'Đã thu hồi', color: STATUS_COLOR.DANGER },
};

// --- admin_notes (§7.3) ---
export const ADMIN_NOTE_VISIBILITY = {
  PLATFORM_ONLY: 'platform_only',
  TENANT_INTERNAL: 'tenant_internal',
} as const;
export type AdminNoteVisibility =
  (typeof ADMIN_NOTE_VISIBILITY)[keyof typeof ADMIN_NOTE_VISIBILITY];
export const ADMIN_NOTE_VISIBILITY_VALUES = Object.values(
  ADMIN_NOTE_VISIBILITY,
) as AdminNoteVisibility[];

// --- approval_logs action (§7.2) ---
export const APPROVAL_ACTION = {
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  REQUEST_REVISION: 'request_revision',
  CANCEL: 'cancel',
  RESUBMIT: 'resubmit',
} as const;
export type ApprovalAction = (typeof APPROVAL_ACTION)[keyof typeof APPROVAL_ACTION];
export const APPROVAL_ACTION_VALUES = Object.values(APPROVAL_ACTION) as ApprovalAction[];
