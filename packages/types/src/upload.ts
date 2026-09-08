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
 * Đính kèm chat (ADR 0009 §5): ảnh hiện inline, tài liệu tải về.
 *
 * Khai ở đây chứ không suy lại ở mỗi phía. Trước đó DTO của backend dựng bộ này từ
 * `IMAGE_UPLOAD_*` còn web dựng từ `DOCUMENT_UPLOAD_*`; hai hằng đang bằng nhau nên không ai
 * thấy gì, nhưng nới một bên là client cho gửi thứ server sẽ từ chối — và người dùng chỉ biết
 * sau khi đã chờ hết một vòng tải lên.
 */
export const CHAT_ATTACHMENT_MIME_TYPES = DOCUMENT_UPLOAD_MIME_TYPES;

export const CHAT_ATTACHMENT_MAX_BYTES = DOCUMENT_UPLOAD_MAX_BYTES;

/** Số tệp tối đa một tin nhắn mang được — DTO `@ArrayMaxSize` và ô soạn tin đọc chung số này. */
export const CHAT_ATTACHMENT_MAX_COUNT = 6;

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

/**
 * Tệp này hiện được ẢNH THU NHỎ hay không. PDF không có thumbnail nên rơi về icon loại tệp.
 *
 * Vị từ THUẦN, cố ý không nằm trong tầng hook của client nào: bề mặt nào cũng hỏi được mà không
 * kéo theo data-fetching, và web/app native phải trả lời giống hệt nhau về cùng một MIME.
 */
export function isPreviewableImage(mimeType: string): boolean {
  return (IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Lý do một tệp bị TỪ CHỐI ngay ở client, trước khi presign.
 *
 * Là MÃ chứ không phải câu (ADR 0012): hàm kiểm là hàm thuần, nó không biết người dùng đang đọc
 * ngôn ngữ nào. Mỗi mã có một khoá tương ứng ở `Errors.upload.*`.
 */
export type UploadRejectionReason =
  | 'imageType'
  | 'imageTooLarge'
  | 'documentType'
  | 'documentTooLarge';

export interface UploadRejection {
  readonly reason: UploadRejectionReason;
  /** Trần dung lượng tính bằng MB — chỉ có ở hai lý do "quá lớn". */
  readonly maxMb?: number;
}

/**
 * Đủ để kiểm một tệp, và là phần CHUNG giữa `File` của web và tệp đã chọn trên native.
 *
 * Nhận hình dạng này chứ không nhận `File`: `File` là DOM API, `packages/*` không được import nó
 * (Metro không đọc được), và mọi thứ hàm kiểm cần chỉ có hai trường.
 */
export interface UploadCandidate {
  readonly type: string;
  readonly size: number;
}

const toMb = (bytes: number): number => Math.round(bytes / 1024 / 1024);

/**
 * Kiểm MIME + dung lượng TRƯỚC khi presign — báo lỗi tức thì thay vì đọc hết tệp rồi để R2 hoặc
 * DTO từ chối. Trần THẬT vẫn ở backend (`@IsIn` + `@Max` + `Content-Length` ký trong URL); đây
 * chỉ là lớp báo sớm.
 */
export function validateImageUpload(file: UploadCandidate): UploadRejection | null {
  if (!(IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { reason: 'imageType' };
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return { reason: 'imageTooLarge', maxMb: toMb(IMAGE_UPLOAD_MAX_BYTES) };
  }
  return null;
}

/** Tài liệu (ảnh chụp hoặc PDF scan) — cùng trần dung lượng với ảnh. */
export function validateDocumentUpload(file: UploadCandidate): UploadRejection | null {
  if (!(DOCUMENT_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { reason: 'documentType' };
  }
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return { reason: 'documentTooLarge', maxMb: toMb(DOCUMENT_UPLOAD_MAX_BYTES) };
  }
  return null;
}
