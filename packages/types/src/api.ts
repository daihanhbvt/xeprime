/**
 * Convention response của API — CLAUDE.md mục 9.
 *
 * Các type này được dùng ở CẢ HAI phía. Backend khai báo generic DTO tương ứng có
 * `@ApiProperty` để `@nestjs/swagger` sinh đúng lớp bọc; nếu quên, OpenAPI spec sẽ mất
 * `{ data }` và type FE sinh ra sẽ sai (ADR 0007).
 */

export interface ApiMeta {
  [key: string]: unknown;
}

export interface PaginationMeta extends ApiMeta {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
}

export interface ApiSuccess<TData, TMeta extends ApiMeta = ApiMeta> {
  data: TData;
  meta?: TMeta;
}

export type ApiPaginated<TItem> = ApiSuccess<TItem[], PaginationMeta>;

export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  details?: unknown;
}

export interface ApiError {
  error: ApiErrorBody;
}

/**
 * Mã lỗi ổn định. Frontend nhánh theo `code`, KHÔNG nhánh theo `message` — message có thể
 * đổi cách diễn đạt bất cứ lúc nào.
 */
export const API_ERROR_CODE = {
  // Auth / session (ADR 0002)
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_ID_TOKEN: 'INVALID_ID_TOKEN',
  // Đăng nhập/đăng ký email-mật khẩu
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',

  // Phân quyền
  FORBIDDEN: 'FORBIDDEN',
  MISSING_PERMISSION: 'MISSING_PERMISSION',
  NO_TENANT_SCOPE: 'NO_TENANT_SCOPE',
  TENANT_NOT_ACTIVE: 'TENANT_NOT_ACTIVE',

  // Dữ liệu
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  // Nghiệp vụ lịch (ADR 0006)
  BOOKING_SCHEDULE_CONFLICT: 'BOOKING_SCHEDULE_CONFLICT',
  /**
   * Đã có một yêu cầu thuê y hệt (cùng xe + SĐT + khung giờ) đang chờ shop phản hồi.
   * Mã riêng thay vì `CONFLICT` chung: FE hiện hộp "Yêu cầu trùng lặp" có lối đi tiếp
   * (xem chuyến / nhắn chủ xe), khác hẳn một alert lỗi thường.
   */
  BOOKING_REQUEST_DUPLICATE: 'BOOKING_REQUEST_DUPLICATE',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /**
   * Yêu cầu có giao xe tận nơi nhưng CHƯA có báo giá giao nhận — không duyệt được.
   * Mã riêng để FE mở thẳng drawer "Báo giá giao nhận" thay vì alert lỗi chung.
   */
  DELIVERY_QUOTE_REQUIRED: 'DELIVERY_QUOTE_REQUIRED',
  /** Khách yêu cầu giao tận nơi nhưng chính sách hiệu lực của xe không bật giao nhận. */
  DELIVERY_NOT_SUPPORTED: 'DELIVERY_NOT_SUPPORTED',

  // Gói/hạn (ADR 0010)
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',

  // Xác thực SĐT / OTP (Phase 4)
  PHONE_NOT_VERIFIED: 'PHONE_NOT_VERIFIED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_COOLDOWN: 'OTP_COOLDOWN',
  OTP_TOO_MANY: 'OTP_TOO_MANY',
  /** Nhập sai mã quá số lần cho phép — mã bị khoá, phải gửi lại mã mới. */
  OTP_LOCKED: 'OTP_LOCKED',

  // OCR giấy tờ xe (Wave 5)
  /** Chưa cấu hình nhà cung cấp OCR — trích xuất tự động không khả dụng, mời nhập tay. */
  OCR_NOT_CONFIGURED: 'OCR_NOT_CONFIGURED',
  /** Đang có job OCR chạy trên phiên bản này — không tạo job trùng. */
  OCR_PROCESSING: 'OCR_PROCESSING',
  /** Ảnh mờ/không đúng định dạng — không trích xuất được, mời nhập tay hoặc tải ảnh khác. */
  OCR_UNREADABLE: 'OCR_UNREADABLE',
  OCR_FAILED: 'OCR_FAILED',

  // Hạ tầng
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Upload ảnh cần đủ bộ env R2 — thiếu thì endpoint presign trả 503 kèm mã này. */
  UPLOADS_NOT_CONFIGURED: 'UPLOADS_NOT_CONFIGURED',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiError).error?.code === 'string'
  );
}

/**
 * Tiền tệ đi qua JSON dưới dạng **string**, không phải number — ADR 0007.
 *
 * Prisma trả `Decimal`; ép sang `number` làm mất chính xác ở phép cộng nhiều khoản.
 * Frontend format bằng `Intl.NumberFormat`, tính toán bằng thư viện decimal.
 */
export type MoneyString = string;

/** Timestamp ISO-8601 ở UTC. Frontend hiển thị theo Asia/Ho_Chi_Minh (CLAUDE.md mục 9). */
export type IsoDateTimeString = string;

/** ULID, 26 ký tự Crockford base32. */
export type Ulid = string;
