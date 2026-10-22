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
   * (tiến trình khởi động lại) thì tự sang `rejected` lý do `reader_unavailable` — khách nộp lại.
   */
  PROCESSING: 'processing',
  /**
   * **@deprecated — ĐÃ GỠ (ADR 0070).** Hàng đợi duyệt tay của ADR 0057. Mọi lượt nộp giờ do hệ
   * thống tự quyết; migration `20261022100000_driver_licence_auto_only` đóng các lượt còn chờ và
   * DB từ chối giá trị này. Chỉ còn ở đây để `apps/mobile` biên dịch được.
   */
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
  /**
   * Bộ đọc ảnh đang lỗi / tắt / quá tải nên CHƯA đọc được — không phải lỗi của ảnh, khách nộp lại
   * sau ít phút. Chưa đọc được thì không bao giờ tự xác thực (ADR 0070).
   */
  READER_UNAVAILABLE: 'reader_unavailable',
  /** LEGACY — lượt duyệt tay cũ từ chối vì lý do khác, kèm ghi chú. Không còn writer (ADR 0070). */
  OTHER: 'other',
} as const;

export type DriverLicenceRejectReason =
  (typeof DRIVER_LICENCE_REJECT_REASON)[keyof typeof DRIVER_LICENCE_REJECT_REASON];
export const DRIVER_LICENCE_REJECT_REASON_VALUES = Object.values(
  DRIVER_LICENCE_REJECT_REASON,
) as DriverLicenceRejectReason[];

/** Độ tin cậy bộ đọc ảnh tự đánh giá cho một lượt đọc — nhãn ở `AdminCustomers.licence.confidence`. */
export const DRIVER_LICENCE_READING_CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type DriverLicenceReadingConfidence =
  (typeof DRIVER_LICENCE_READING_CONFIDENCE)[keyof typeof DRIVER_LICENCE_READING_CONFIDENCE];
export const DRIVER_LICENCE_READING_CONFIDENCE_VALUES = Object.values(
  DRIVER_LICENCE_READING_CONFIDENCE,
) as DriverLicenceReadingConfidence[];

/** Ai ra quyết định cuối cùng của một lượt nộp. */
export const DRIVER_LICENCE_DECISION_SOURCE = {
  AUTO: 'auto',
  /** LEGACY — lượt duyệt tay trước ADR 0070. Không còn writer. */
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

/**
 * Tình trạng bằng lái của MỘT khách trong hồ sơ khách thuê (admin nền tảng — ADR 0070): có bằng
 * đang dùng thì `verified` (dù có lượt nộp mới hơn); không thì theo lượt nộp gần nhất.
 */
export const CUSTOMER_LICENCE_STATE = {
  NONE: 'none',
  PROCESSING: 'processing',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type CustomerLicenceState =
  (typeof CUSTOMER_LICENCE_STATE)[keyof typeof CUSTOMER_LICENCE_STATE];
export const CUSTOMER_LICENCE_STATE_VALUES = Object.values(
  CUSTOMER_LICENCE_STATE,
) as CustomerLicenceState[];
