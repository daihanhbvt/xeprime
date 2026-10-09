import { STATUS_COLOR, type StatusMeta } from './meta';
import { SERVICE_TYPE, type ServiceType } from './vehicle';
import { IMAGE_UPLOAD_MIME_TYPES } from '../upload';

/**
 * Bằng lái của TÀI KHOẢN KHÁCH — ADR 0057.
 *
 * Khác hẳn giấy tờ trong sổ khách của gian hàng (`tenant_customer_documents`): đây là giấy tờ do
 * CHÍNH người đi thuê nộp cho NỀN TẢNG một lần, và là điều kiện để gửi yêu cầu thuê xe tự lái.
 * Mỗi lần nộp là MỘT dòng `customer_driver_licences` (lịch sử giữ nguyên); bằng đang dùng là dòng
 * `verified` duy nhất của tài khoản.
 */
export const DRIVER_LICENCE_STATUS = {
  /** Đã cấp link tải ảnh, chưa xác nhận file. */
  UPLOADING: 'uploading',
  /**
   * Đang đọc ảnh — chạy NỀN sau lượt `complete`, thường xong trong vài chục giây. Kẹt quá 5 phút
   * (tiến trình khởi động lại) thì tự sang `pending_review`; khởi động lại API thì đọc tiếp.
   */
  PROCESSING: 'processing',
  /** Đọc xong nhưng cần người của XePrime xem (bằng nước ngoài, ảnh mập mờ, OCR chưa bật). */
  PENDING_REVIEW: 'pending_review',
  /** Đã xác thực — đặt được xe tự lái trong phạm vi hạng và hạn của bằng. */
  VERIFIED: 'verified',
  /** Không dùng được — kèm `rejectionReason`. Khách nộp ảnh khác. */
  REJECTED: 'rejected',
  /** Từng `verified`, đã được thay bằng một bằng mới vừa xác thực. */
  SUPERSEDED: 'superseded',
  /** Lượt nộp bị bỏ dở hoặc bị lượt nộp mới hơn thay thế trước khi có kết quả. */
  CANCELLED: 'cancelled',
} as const;

export type DriverLicenceStatus =
  (typeof DRIVER_LICENCE_STATUS)[keyof typeof DRIVER_LICENCE_STATUS];
export const DRIVER_LICENCE_STATUS_VALUES = Object.values(
  DRIVER_LICENCE_STATUS,
) as DriverLicenceStatus[];

/**
 * Lượt nộp ĐANG DỞ — tối đa MỘT cho mỗi tài khoản (partial unique ở DB). Nộp ảnh mới thì lượt dở
 * cũ chuyển `cancelled`; người duyệt đang mở nó sẽ nhận 409 thay vì duyệt một ảnh khách đã bỏ.
 */
export const DRIVER_LICENCE_IN_FLIGHT_STATUSES: readonly DriverLicenceStatus[] = [
  DRIVER_LICENCE_STATUS.UPLOADING,
  DRIVER_LICENCE_STATUS.PROCESSING,
  DRIVER_LICENCE_STATUS.PENDING_REVIEW,
];

export const DRIVER_LICENCE_STATUS_META: Readonly<Record<DriverLicenceStatus, StatusMeta>> = {
  [DRIVER_LICENCE_STATUS.UPLOADING]: { label: 'Đang tải lên', color: STATUS_COLOR.NEUTRAL },
  [DRIVER_LICENCE_STATUS.PROCESSING]: { label: 'Đang đọc ảnh', color: STATUS_COLOR.PROCESSING },
  [DRIVER_LICENCE_STATUS.PENDING_REVIEW]: { label: 'Chờ xem xét', color: STATUS_COLOR.WAITING },
  [DRIVER_LICENCE_STATUS.VERIFIED]: { label: 'Đã xác thực', color: STATUS_COLOR.SUCCESS },
  [DRIVER_LICENCE_STATUS.REJECTED]: { label: 'Không hợp lệ', color: STATUS_COLOR.DANGER },
  [DRIVER_LICENCE_STATUS.SUPERSEDED]: { label: 'Đã thay bằng mới', color: STATUS_COLOR.NEUTRAL },
  [DRIVER_LICENCE_STATUS.CANCELLED]: { label: 'Đã huỷ', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Loại giấy tờ.
 *
 *  - `vn`                   — GPLX Việt Nam (thẻ PET mẫu cũ, mẫu 2025, bản trên VNeID).
 *  - `international_permit` — Giấy phép lái xe quốc tế (IDP, Công ước Viên 1968) — trang có ảnh
 *                             và thông tin người lái.
 *  - `foreign`              — bằng lái quốc gia của nước khác.
 *
 * Bằng quốc tế / nước ngoài tự xác thực khi máy nhận ra đúng là bằng lái, KHÔNG có hạng/hạn — chủ
 * xe đối chiếu bằng gốc lúc giao xe (ADR 0057 điều 2c).
 */
export const DRIVER_LICENCE_KIND = {
  VN: 'vn',
  INTERNATIONAL_PERMIT: 'international_permit',
  FOREIGN: 'foreign',
} as const;

export type DriverLicenceKind = (typeof DRIVER_LICENCE_KIND)[keyof typeof DRIVER_LICENCE_KIND];
export const DRIVER_LICENCE_KIND_VALUES = Object.values(DRIVER_LICENCE_KIND) as DriverLicenceKind[];

/** Lý do không dùng được — mã đi trên dây, nhãn dịch ở `Domain.driverLicenceRejectReason`. */
export const DRIVER_LICENCE_REJECT_REASON = {
  /** Ảnh không phải bằng lái (CCCD, hộ chiếu, ảnh khác). */
  NOT_A_LICENCE: 'not_a_licence',
  /** Chụp mặt sau — mặt sau không có số bằng, họ tên, hạng. */
  BACK_SIDE: 'back_side',
  /** Mờ, loá, thiếu góc, tối — chữ không đọc được. */
  UNREADABLE: 'unreadable',
  /** Đọc được ảnh nhưng thiếu số bằng / họ tên / hạng / hạn. */
  MISSING_FIELDS: 'missing_fields',
  /** Bằng đã hết hạn. */
  EXPIRED: 'expired',
  /** Hạng trên bằng không lái được ô tô lẫn xe máy (vd chỉ có hạng máy kéo). */
  NO_DRIVABLE_CLASS: 'no_drivable_class',
  /** Người duyệt từ chối vì lý do khác — bắt buộc kèm ghi chú. Hệ thống tự động không dùng mã này. */
  OTHER: 'other',
} as const;

export type DriverLicenceRejectReason =
  (typeof DRIVER_LICENCE_REJECT_REASON)[keyof typeof DRIVER_LICENCE_REJECT_REASON];
export const DRIVER_LICENCE_REJECT_REASON_VALUES = Object.values(
  DRIVER_LICENCE_REJECT_REASON,
) as DriverLicenceRejectReason[];

/**
 * Lý do bị từ chối TỰ ĐỘNG mà khách được quyền nhờ người xem lại — đúng những lý do máy đọc ảnh
 * có thể đọc sai. `expired` nằm đây vì máy đọc chữ (Tesseract) có thể đọc lệch một chữ số ngày
 * tháng ("15/03" thành "05/03") — một tấm bằng còn hạn vài ngày thành "hết hạn" mà khách không có
 * đường nào ngoài chụp lại. `not_a_licence` / `back_side` thì không: khách tự thấy và sửa được.
 */
export const DRIVER_LICENCE_REVIEWABLE_REJECT_REASONS: readonly DriverLicenceRejectReason[] = [
  DRIVER_LICENCE_REJECT_REASON.UNREADABLE,
  DRIVER_LICENCE_REJECT_REASON.MISSING_FIELDS,
  DRIVER_LICENCE_REJECT_REASON.EXPIRED,
  DRIVER_LICENCE_REJECT_REASON.NO_DRIVABLE_CLASS,
];

/**
 * Vì sao một lượt nộp đang CHỜ NGƯỜI DUYỆT — mã đi trên dây (`reading.pendingReason`), nhãn dịch ở
 * namespace `AdminDriverLicences.pendingReason`. Cho người duyệt, không cho khách.
 */
export const DRIVER_LICENCE_PENDING_REASON = {
  /** Các lượt đọc lệch nhau ở một trường then chốt. */
  LOW_CONFIDENCE: 'low_confidence',
  /** Ngày sinh cho ra người dưới tuổi được cấp bằng — gần như chắc chắn đọc sai. */
  IMPLAUSIBLE_BIRTH_DATE: 'implausible_birth_date',
  /** Hạn đọc được không thể có với hạng đó (hạng ô tô "không thời hạn", hạn quá xa, hạn trước ngày cấp). */
  IMPLAUSIBLE_EXPIRY: 'implausible_expiry',
  /** Bộ đọc hỏng, bị tắt, quá tải hoặc không lấy được ảnh. */
  READER_UNAVAILABLE: 'reader_unavailable',
  /** Khách nhờ xem lại một lần từ chối tự động. */
  CUSTOMER_REQUEST: 'customer_request',
} as const;

export type DriverLicencePendingReason =
  (typeof DRIVER_LICENCE_PENDING_REASON)[keyof typeof DRIVER_LICENCE_PENDING_REASON];
export const DRIVER_LICENCE_PENDING_REASON_VALUES = Object.values(
  DRIVER_LICENCE_PENDING_REASON,
) as DriverLicencePendingReason[];

/** Ai ra quyết định cuối cùng của một lượt nộp. */
export const DRIVER_LICENCE_DECISION_SOURCE = {
  AUTO: 'auto',
  MANUAL: 'manual',
} as const;

export type DriverLicenceDecisionSource =
  (typeof DRIVER_LICENCE_DECISION_SOURCE)[keyof typeof DRIVER_LICENCE_DECISION_SOURCE];
export const DRIVER_LICENCE_DECISION_SOURCE_VALUES = Object.values(
  DRIVER_LICENCE_DECISION_SOURCE,
) as DriverLicenceDecisionSource[];

/** Vấn đề chất lượng ảnh mà bộ đọc nhận ra — để giao diện gợi ý ĐÚNG cách chụp lại. */
export const DRIVER_LICENCE_QUALITY_ISSUE = {
  BLURRY: 'blurry',
  GLARE: 'glare',
  CROPPED: 'cropped',
  TOO_DARK: 'too_dark',
  OBSTRUCTED: 'obstructed',
  LOW_RESOLUTION: 'low_resolution',
} as const;

export type DriverLicenceQualityIssue =
  (typeof DRIVER_LICENCE_QUALITY_ISSUE)[keyof typeof DRIVER_LICENCE_QUALITY_ISSUE];
export const DRIVER_LICENCE_QUALITY_ISSUE_VALUES = Object.values(
  DRIVER_LICENCE_QUALITY_ISSUE,
) as DriverLicenceQualityIssue[];

/**
 * Ràng buộc ảnh nộp lên. Chỉ ẢNH (không PDF): bộ đọc nhận ảnh, và một bản scan PDF nhiều trang
 * chỉ làm khách nộp nhầm mặt sau. Trần 5MB là trần phòng thủ — client đã nén về cạnh dài
 * `DRIVER_LICENCE_IMAGE_MAX_EDGE_PX` trước khi tải, nên ảnh thật thường dưới 1MB.
 */
export const DRIVER_LICENCE_UPLOAD_MIME_TYPES = IMAGE_UPLOAD_MIME_TYPES;
export const DRIVER_LICENCE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const DRIVER_LICENCE_IMAGE_MAX_EDGE_PX = 2000;

/**
 * Dịch vụ nào bắt khách có bằng lái đã xác thực. Thuê CÓ TÀI XẾ thì người cầm lái là tài xế của
 * gian hàng — khách không cần bằng.
 */
export const DRIVER_LICENCE_REQUIRED_SERVICE_TYPES: readonly ServiceType[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.LONG_TERM,
];

export function serviceRequiresDriverLicence(serviceType: string | null | undefined): boolean {
  return (DRIVER_LICENCE_REQUIRED_SERVICE_TYPES as readonly string[]).includes(
    serviceType ?? SERVICE_TYPE.SELF_DRIVE,
  );
}
