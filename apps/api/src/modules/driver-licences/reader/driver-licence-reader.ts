import type {
  DriverLicenceQualityIssue,
  DriverLicenceKind,
  ImageUploadMimeType,
} from '@xeprime/types';

/**
 * Bộ đọc ảnh bằng lái — khớp nối TRUNG LẬP nhà cung cấp (ADR 0057).
 *
 * Bộ đọc chỉ KỂ LẠI những gì nó thấy trên ảnh. Nó không quyết định gì: "tự xác thực / từ chối /
 * nhờ người duyệt" là của `decideFromReading` ở server, đọc trên kết quả này. Nhờ vậy đổi bộ đọc
 * (bản hiện tại là Tesseract chạy tại chỗ; sau này có thể là một dịch vụ eKYC trong nước) không
 * đổi luật nghiệp vụ một dòng nào.
 */
export const DRIVER_LICENCE_READER = 'DRIVER_LICENCE_READER';

/** Loại giấy tờ bộ đọc nhận ra — thêm `not_a_licence` so với loại bằng lưu ở DB. */
export type ReadingDocumentKind = DriverLicenceKind | 'not_a_licence';

export type ReadingConfidence = 'high' | 'medium' | 'low';

export interface DriverLicenceReading {
  isDriverLicence: boolean;
  documentKind: ReadingDocumentKind;
  side: 'front' | 'back' | 'unknown';
  /** Số bằng, họ tên, hạng, hạn đọc được rõ ràng. */
  readable: boolean;
  qualityIssues: DriverLicenceQualityIssue[];
  confidence: ReadingConfidence;
  /** Trường không in / không đọc được ⇒ `null`, KHÔNG đoán. Ngày ở dạng `YYYY-MM-DD`. */
  licenceNumber: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  classes: string[];
  issuedOn: string | null;
  expiresOn: string | null;
  noExpiry: boolean;
  issuingCountry: string | null;
  /** Nhận định CỦA BỘ ĐỌC — server chỉ dùng như gợi ý cho người duyệt bằng nước ngoài. */
  coversCar: boolean;
  coversMotorbike: boolean;
  /** Ghi chú cho người duyệt (ảnh chụp màn hình, bản photo, che một phần…). */
  notes: string | null;
}

/** Vì sao một lượt đọc hỏng — lượt nộp vẫn sang hàng đợi duyệt, mã này cho người duyệt biết. */
export const READER_FAILURE = {
  TIMEOUT: 'OCR_TIMEOUT',
  PROVIDER_ERROR: 'OCR_PROVIDER_ERROR',
  /** Bộ đọc đang có quá nhiều lượt chờ — lượt này sang người duyệt ngay thay vì xếp hàng. */
  BUSY: 'OCR_BUSY',
  /** Ảnh không đọc được từ kho (R2). */
  IMAGE_UNAVAILABLE: 'OCR_IMAGE_UNAVAILABLE',
  /** Ảnh tải được nhưng không giải mã được (hỏng, hoặc nở quá trần điểm ảnh). */
  IMAGE_UNDECODABLE: 'OCR_IMAGE_UNDECODABLE',
  NOT_CONFIGURED: 'OCR_NOT_CONFIGURED',
  /** Tiến trình dừng giữa chừng (khởi động lại) — phát hiện lúc đọc lại trạng thái. */
  INTERRUPTED: 'OCR_INTERRUPTED',
} as const;

export type ReaderFailureCode = (typeof READER_FAILURE)[keyof typeof READER_FAILURE];

export class DriverLicenceReaderError extends Error {
  constructor(
    readonly code: ReaderFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'DriverLicenceReaderError';
  }
}

export interface DriverLicenceReader {
  /** Tên nhà cung cấp — lưu vào `ocr_provider`. */
  readonly name: string;
  /** Mô hình/phiên bản — lưu vào `ocr_model`. */
  readonly model: string | null;
  readonly enabled: boolean;
  read(input: { image: Uint8Array; mimeType: ImageUploadMimeType }): Promise<DriverLicenceReading>;
  /** Giải phóng tài nguyên (worker, kết nối) — gọi một lần khi tắt tiến trình. */
  dispose?(): Promise<void>;
}

/**
 * Khi tắt đọc tự động (`DRIVER_LICENCE_OCR=off`) — KHÔNG giả kết quả. Lượt nộp đi thẳng vào hàng
 * đợi duyệt tay; service không gọi `read` khi `enabled = false`.
 */
export class NotConfiguredDriverLicenceReader implements DriverLicenceReader {
  readonly name = 'not_configured';
  readonly model = null;
  readonly enabled = false;

  read(): Promise<DriverLicenceReading> {
    return Promise.reject(
      new DriverLicenceReaderError(READER_FAILURE.NOT_CONFIGURED, 'Chưa cấu hình bộ đọc ảnh'),
    );
  }
}
