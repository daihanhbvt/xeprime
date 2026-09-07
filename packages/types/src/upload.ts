/**
 * Ràng buộc upload ảnh (presign R2) — dùng chung cho DTO validate ở backend và pre-check
 * client trước khi presign, để hai phía không lệch nhau.
 *
 * Giới hạn size được ký thẳng vào presigned PUT (Content-Length) nên là chặn cứng phía R2,
 * không chỉ là check thiện chí ở client.
 */
export const IMAGE_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ImageUploadMimeType = (typeof IMAGE_UPLOAD_MIME_TYPES)[number];

export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Tài liệu hợp đồng (nguồn xe, thuê lại, hợp tác — Wave 4): ảnh chụp hoặc PDF scan.
 * Cùng trần 10MB với ảnh; file này KHÔNG bao giờ xuất hiện ở API public (marketplace).
 */
export const DOCUMENT_UPLOAD_MIME_TYPES = [...IMAGE_UPLOAD_MIME_TYPES, 'application/pdf'] as const;

export type DocumentUploadMimeType = (typeof DOCUMENT_UPLOAD_MIME_TYPES)[number];

export const DOCUMENT_UPLOAD_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES;

export const SOURCE_CONTRACT_MAX_FILES = 10;

/**
 * Tài liệu riêng tư gắn với xe (Wave 4.1) — hợp đồng nguồn xe; Wave 5 tái dùng cho giấy tờ.
 * Nhị phân ở bucket R2 riêng tư, metadata do server sở hữu (`vehicle_private_files`).
 */
export const PRIVATE_FILE_PURPOSE = {
  SOURCE_CONTRACT: 'source_contract',
  /** Giấy tờ xe (Wave 5): cà vẹt / đăng kiểm / bảo hiểm / khác. */
  VEHICLE_DOCUMENT: 'vehicle_document',
  /** Chứng từ bảo dưỡng (Wave 6): hóa đơn garage, phiếu chi — riêng tư như hai loại trên. */
  MAINTENANCE_RECORD: 'maintenance_record',
  /**
   * Ảnh hiện trạng bàn giao (Wave 7): 4 góc ngoại thất + ảnh đồng hồ Odo. Riêng tư TUYỆT ĐỐI
   * — ảnh chứa biển số, đôi khi cả khách trong khung hình; đây là bằng chứng tranh chấp, không
   * phải ảnh marketing.
   */
  HANDOVER_PHOTO: 'handover_photo',
  /**
   * Giấy tờ KHÁCH THUÊ (CCCD / GPLX) trong sổ khách của gian hàng. Riêng tư tuyệt đối: đây là
   * PII của người thứ ba mà shop chỉ giữ hộ để đối chiếu lúc giao xe — không bao giờ có URL
   * công khai, và mở lại file cũ là một quyền riêng (`customers.documents.view_files`).
   */
  CUSTOMER_DOCUMENT: 'customer_document',
} as const;
export type PrivateFilePurpose = (typeof PRIVATE_FILE_PURPOSE)[keyof typeof PRIVATE_FILE_PURPOSE];

/** pending = đã presign chưa xác minh · ready = đã xác minh, đính được · deleted = đã gỡ. */
export const PRIVATE_FILE_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  DELETED: 'deleted',
} as const;
export type PrivateFileStatus = (typeof PRIVATE_FILE_STATUS)[keyof typeof PRIVATE_FILE_STATUS];

/** Đuôi file an toàn suy từ MIME đã duyệt — KHÔNG lấy từ tên file người dùng nộp. */
export const DOCUMENT_MIME_EXTENSION: Readonly<Record<DocumentUploadMimeType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
