import type { VehicleDocumentOcrField } from '@xeprime/types';

/**
 * Khớp nối OCR trung lập nhà cung cấp (Wave 5).
 *
 * Repo HIỆN CHƯA có provider OCR nào được cấu hình (không dependency, không credential) —
 * provider mặc định là `OcrNotConfiguredProvider`: endpoint yêu cầu OCR trả 503
 * `OCR_NOT_CONFIGURED` có kiểm soát, người dùng nhập tay. TUYỆT ĐỐI không giả kết quả
 * OCR thành công ở production; provider giả chỉ dùng trong test.
 *
 * Khi có provider thật (Google Vision, Textract…): implement interface này, đăng ký thay
 * `useClass` ở vehicles.module — phần điều phối/lưu trữ/review không phải đổi.
 */
export const VEHICLE_DOCUMENT_OCR_PROVIDER = 'VEHICLE_DOCUMENT_OCR_PROVIDER';

export interface OcrExtractedField {
  value: string;
  /** 0–100 nếu provider có; không có thì bỏ trống, KHÔNG bịa. */
  confidence?: number;
  /** Bằng chứng nguồn (đoạn text/vị trí) nếu provider trả — phục vụ màn đối soát. */
  evidence?: string;
}

export interface OcrExtractionResult {
  /** `needs_review` = đọc được, chờ đối soát · `unreadable` = ảnh mờ/sai định dạng. */
  status: 'needs_review' | 'unreadable';
  /** Độ tin cậy tổng 0–100 nếu có. */
  confidence?: number;
  /** CHỈ trường có bằng chứng — trường không đọc được thì vắng mặt, không để chuỗi rỗng. */
  fields: Partial<Record<VehicleDocumentOcrField, OcrExtractedField>>;
}

export interface VehicleDocumentOcrProvider {
  readonly name: string;
  readonly enabled: boolean;
  extract(input: {
    objectKey: string;
    mimeType: string;
    documentType: string;
  }): Promise<OcrExtractionResult>;
}

/** Mặc định khi chưa cấu hình provider — fail rõ ràng, không giả thành công. */
export class OcrNotConfiguredProvider implements VehicleDocumentOcrProvider {
  readonly name = 'not_configured';
  readonly enabled = false;

  extract(): Promise<OcrExtractionResult> {
    return Promise.reject(new Error('OCR provider chưa được cấu hình'));
  }
}
