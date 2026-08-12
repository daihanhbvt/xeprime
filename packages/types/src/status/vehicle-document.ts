/**
 * Giấy tờ xe & OCR (Wave 5) — docs/design/12_VEHICLE_360_MANAGEMENT.md §8.
 *
 * Giấy tờ là TUỲ CHỌN. Hết hạn chỉ tạo CẢNH BÁO — không đổi operation/public status,
 * không chặn đặt xe, không gỡ khỏi marketplace (quyết định nghiệp vụ §2).
 */

export const VEHICLE_DOCUMENT_TYPE = {
  REGISTRATION: 'registration',
  INSPECTION: 'inspection',
  INSURANCE: 'insurance',
  OTHER: 'other',
} as const;

export type VehicleDocumentType =
  (typeof VEHICLE_DOCUMENT_TYPE)[keyof typeof VEHICLE_DOCUMENT_TYPE];
export const VEHICLE_DOCUMENT_TYPE_VALUES = Object.values(
  VEHICLE_DOCUMENT_TYPE,
) as VehicleDocumentType[];

export const VEHICLE_DOCUMENT_TYPE_LABEL: Readonly<Record<VehicleDocumentType, string>> = {
  [VEHICLE_DOCUMENT_TYPE.REGISTRATION]: 'Đăng ký xe (Cà vẹt)',
  [VEHICLE_DOCUMENT_TYPE.INSPECTION]: 'Đăng kiểm kỹ thuật',
  [VEHICLE_DOCUMENT_TYPE.INSURANCE]: 'Bảo hiểm TNDS bắt buộc',
  [VEHICLE_DOCUMENT_TYPE.OTHER]: 'Giấy tờ khác',
};

/**
 * Trạng thái CÔNG VIỆC của một job OCR — dữ liệu bền, lưu ở `vehicle_document_ocr_jobs`.
 * Tách khỏi trạng thái hạn dùng (suy từ `expiresAt`, KHÔNG lưu).
 */
export const VEHICLE_DOCUMENT_OCR_STATUS = {
  PROCESSING: 'processing',
  /** Đã trích xuất xong — kết quả là BẢN NHÁP chờ người dùng đối soát, không tự ghi đè. */
  NEEDS_REVIEW: 'needs_review',
  /** Ảnh mờ/không đúng định dạng — mời nhập tay hoặc tải ảnh khác. */
  UNREADABLE: 'unreadable',
  FAILED: 'failed',
  /** Người dùng đã đối soát xong (áp một phần hoặc bỏ qua). */
  REVIEWED: 'reviewed',
} as const;

export type VehicleDocumentOcrStatus =
  (typeof VEHICLE_DOCUMENT_OCR_STATUS)[keyof typeof VEHICLE_DOCUMENT_OCR_STATUS];
export const VEHICLE_DOCUMENT_OCR_STATUS_VALUES = Object.values(
  VEHICLE_DOCUMENT_OCR_STATUS,
) as VehicleDocumentOcrStatus[];

/**
 * Trạng thái TRÌNH BÀY của một loại giấy tờ — luôn SUY RA lúc đọc, không có cột nào lưu nó:
 * workflow (job OCR đang chạy/cần kiểm tra/không đọc được) thắng trạng thái hạn dùng;
 * hạn dùng suy từ `expiresAt` + ngưỡng cảnh báo cấu hình được.
 */
export const VEHICLE_DOCUMENT_PRESENTATION = {
  MISSING: 'missing',
  PROCESSING: 'processing',
  NEEDS_REVIEW: 'needs_review',
  UNREADABLE: 'unreadable',
  VALID: 'valid',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRED: 'expired',
} as const;

export type VehicleDocumentPresentation =
  (typeof VEHICLE_DOCUMENT_PRESENTATION)[keyof typeof VEHICLE_DOCUMENT_PRESENTATION];

export const VEHICLE_DOCUMENT_PRESENTATION_META: Readonly<
  Record<VehicleDocumentPresentation, { label: string; color: string }>
> = {
  [VEHICLE_DOCUMENT_PRESENTATION.MISSING]: { label: 'Chưa có', color: 'default' },
  [VEHICLE_DOCUMENT_PRESENTATION.PROCESSING]: { label: 'Đang xử lý', color: 'blue' },
  [VEHICLE_DOCUMENT_PRESENTATION.NEEDS_REVIEW]: { label: 'Cần kiểm tra', color: 'orange' },
  [VEHICLE_DOCUMENT_PRESENTATION.UNREADABLE]: { label: 'Không đọc được', color: 'red' },
  [VEHICLE_DOCUMENT_PRESENTATION.VALID]: { label: 'Còn hiệu lực', color: 'green' },
  [VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON]: { label: 'Sắp hết hạn', color: 'orange' },
  [VEHICLE_DOCUMENT_PRESENTATION.EXPIRED]: { label: 'Đã hết hạn', color: 'red' },
};

/**
 * Suy trạng thái trình bày. `warningDays` là ngưỡng "sắp hết hạn" — sản phẩm CHƯA chốt con số
 * (§8: "không hard-code 30 ngày như luật đã chốt"), nên nó là cấu hình tenant
 * (`tenant_profiles.settings_json.documentExpiryWarningDays`), `null` = chưa cấu hình →
 * chỉ suy được `valid`/`expired`.
 */
export function vehicleDocumentPresentation(input: {
  hasActiveVersion: boolean;
  ocrStatus?: VehicleDocumentOcrStatus | null;
  /** YYYY-MM-DD hoặc null (không thời hạn). */
  expiresAt?: string | null;
  warningDays?: number | null;
  /** YYYY-MM-DD "hôm nay" — truyền vào để hàm thuần và test được. */
  today: string;
}): VehicleDocumentPresentation {
  if (!input.hasActiveVersion) return VEHICLE_DOCUMENT_PRESENTATION.MISSING;
  // Workflow đang dở thắng trạng thái hạn dùng — người dùng cần xử lý nó trước.
  if (input.ocrStatus === VEHICLE_DOCUMENT_OCR_STATUS.PROCESSING) {
    return VEHICLE_DOCUMENT_PRESENTATION.PROCESSING;
  }
  if (input.ocrStatus === VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW) {
    return VEHICLE_DOCUMENT_PRESENTATION.NEEDS_REVIEW;
  }
  if (input.ocrStatus === VEHICLE_DOCUMENT_OCR_STATUS.UNREADABLE) {
    return VEHICLE_DOCUMENT_PRESENTATION.UNREADABLE;
  }

  if (!input.expiresAt) return VEHICLE_DOCUMENT_PRESENTATION.VALID;
  if (input.expiresAt < input.today) return VEHICLE_DOCUMENT_PRESENTATION.EXPIRED;
  if (input.warningDays != null && input.warningDays > 0) {
    const expiry = new Date(`${input.expiresAt}T00:00:00.000Z`).getTime();
    const now = new Date(`${input.today}T00:00:00.000Z`).getTime();
    const daysLeft = Math.floor((expiry - now) / 86_400_000);
    if (daysLeft <= input.warningDays) return VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON;
  }
  return VEHICLE_DOCUMENT_PRESENTATION.VALID;
}

/**
 * Trường OCR có thể trích xuất (docs §8) — key ổn định dùng xuyên job/review/audit.
 * Trường không có bằng chứng thì KHÔNG xuất hiện trong kết quả (không bịa giá trị).
 */
export const VEHICLE_DOCUMENT_OCR_FIELD = {
  HOLDER_NAME: 'holderName',
  HOLDER_ADDRESS: 'holderAddress',
  PLATE_NUMBER: 'plateNumber',
  CHASSIS_NUMBER: 'chassisNumber',
  ENGINE_NUMBER: 'engineNumber',
  ISSUED_AT: 'issuedAt',
  EXPIRES_AT: 'expiresAt',
  DOCUMENT_NUMBER: 'documentNumber',
} as const;

export type VehicleDocumentOcrField =
  (typeof VEHICLE_DOCUMENT_OCR_FIELD)[keyof typeof VEHICLE_DOCUMENT_OCR_FIELD];
export const VEHICLE_DOCUMENT_OCR_FIELD_VALUES = Object.values(
  VEHICLE_DOCUMENT_OCR_FIELD,
) as VehicleDocumentOcrField[];

export const VEHICLE_DOCUMENT_OCR_FIELD_LABEL: Readonly<Record<VehicleDocumentOcrField, string>> =
  {
    [VEHICLE_DOCUMENT_OCR_FIELD.HOLDER_NAME]: 'Họ tên chủ xe',
    [VEHICLE_DOCUMENT_OCR_FIELD.HOLDER_ADDRESS]: 'Địa chỉ',
    [VEHICLE_DOCUMENT_OCR_FIELD.PLATE_NUMBER]: 'Biển số',
    [VEHICLE_DOCUMENT_OCR_FIELD.CHASSIS_NUMBER]: 'Số khung (Chassis)',
    [VEHICLE_DOCUMENT_OCR_FIELD.ENGINE_NUMBER]: 'Số máy (Engine)',
    [VEHICLE_DOCUMENT_OCR_FIELD.ISSUED_AT]: 'Ngày đăng ký',
    [VEHICLE_DOCUMENT_OCR_FIELD.EXPIRES_AT]: 'Ngày hết hạn',
    [VEHICLE_DOCUMENT_OCR_FIELD.DOCUMENT_NUMBER]: 'Số giấy tờ',
  };
