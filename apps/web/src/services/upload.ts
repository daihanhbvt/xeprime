import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MIME_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME_TYPES,
  type components,
} from '@xeprime/types';
import { ApiClientError, apiPost } from '@/services/api-client';

/**
 * Upload file lên R2 theo pattern presign → PUT thẳng (nhị phân KHÔNG đi qua API — cùng cơ chế
 * với đính kèm chat, ADR 0009 §5). Đây là chỗ dùng chung cho ảnh xe / ảnh gian hàng; chat
 * re-import `uploadToR2` từ đây (skill shared-code).
 */

export type UploadPresign = components['schemas']['UploadPresignDto'];

/**
 * Lỗi tải tệp nói bằng MÃ như mọi lỗi khác (ADR 0012); giao diện chọn chữ qua `Errors.code.*`.
 * `message` chỉ để đọc trong log — nó không bao giờ lên màn hình.
 */
function uploadFailed(status: number): ApiClientError {
  return new ApiClientError({
    code: 'UPLOAD_FAILED',
    message: `Upload failed with HTTP ${status}`,
    status,
  });
}

/** Upload thẳng lên R2 qua presigned PUT — fetch trần, không cookie/envelope của api-client. */
export async function uploadToR2(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', uploadUrl);
      request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total === 0) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(uploadFailed(request.status));
      };
      request.onerror = () => reject(uploadFailed(0));
      request.onabort = () => reject(uploadFailed(0));
      request.send(file);
    });
    return;
  }

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) throw uploadFailed(res.status);
}

/**
 * Vì sao tệp bị từ chối — LÝ DO kèm tham số, không phải một câu.
 *
 * Hai hàm dưới là hàm thuần chạy được ở mọi nơi (kể cả ngoài cây React), nên chúng không
 * biết người dùng đang đọc ngôn ngữ nào. `useUploadRejectionMessage()` đổi lý do thành chữ.
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

const toMb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/**
 * Check MIME + dung lượng TRƯỚC khi presign — báo lỗi tức thì thay vì để R2 từ chối.
 * Trần thật vẫn ở backend (DTO validate + Content-Length ký trong URL).
 */
export function validateImageFile(file: File): UploadRejection | null {
  if (!(IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { reason: 'imageType' };
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return { reason: 'imageTooLarge', maxMb: toMb(IMAGE_UPLOAD_MAX_BYTES) };
  }
  return null;
}

/** Tài liệu hợp đồng (ảnh chụp hoặc PDF scan) — cùng trần dung lượng với ảnh. */
export function validateDocumentFile(file: File): UploadRejection | null {
  if (!(DOCUMENT_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { reason: 'documentType' };
  }
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return { reason: 'documentTooLarge', maxMb: toMb(DOCUMENT_UPLOAD_MAX_BYTES) };
  }
  return null;
}

const presignBody = (file: File) => ({
  fileName: file.name,
  contentType: file.type,
  fileSize: file.size,
});

/** Presign ảnh xe (đại diện/gallery) — cần quyền `vehicles.update` trong gian hàng. */
export const presignVehicleImage = (file: File): Promise<UploadPresign> =>
  apiPost<UploadPresign>('/uploads/vehicle-images/presign', presignBody(file));

// Presign hợp đồng nguồn xe Wave 4 đã GỠ (Wave 4.1): hợp đồng là tài liệu RIÊNG TƯ, đi qua
// flow presign→complete→download có kiểm quyền ở `features/vehicles/api.ts`, không qua đây.

/** Presign logo/ảnh bìa gian hàng — cần quyền `tenant.update`. */
export const presignShopMedia = (file: File): Promise<UploadPresign> =>
  apiPost<UploadPresign>('/uploads/shop-media/presign', presignBody(file));

/**
 * Presign ảnh minh chứng phiếu thu/chi (bill, hoá đơn xăng, biên lai CK) — cần `receipts.create`.
 *
 * Bucket CÔNG KHAI như ảnh xe, không phải kho riêng tư của hợp đồng: đây là chứng từ chi tiêu,
 * không mang giấy tờ tuỳ thân.
 */
export const presignReceiptAttachment = (file: File): Promise<UploadPresign> =>
  apiPost<UploadPresign>('/uploads/receipt-attachments/presign', presignBody(file));

/** Presign ảnh banner trang chủ — cần quyền `platform.banners.manage`. */
export const presignBannerImage = (file: File): Promise<UploadPresign> =>
  apiPost<UploadPresign>('/platform/banners/presign', presignBody(file));

/** Presign 1 file ảnh rồi PUT lên R2, trả URL công khai để lưu vào form/API. */
export async function uploadImage(
  file: File,
  presign: (file: File) => Promise<UploadPresign>,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new ApiClientError({
    code: `UPLOAD_REJECTED_${invalid.reason}`,
    message: `Upload rejected: ${invalid.reason}`,
    status: 0,
  });
  const ticket = await presign(file);
  await uploadToR2(ticket.uploadUrl, file, onProgress);
  return ticket.publicUrl;
}
