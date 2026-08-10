import {
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME_TYPES,
  type components,
} from '@xeprime/types';
import { apiPost } from '@/services/api-client';

/**
 * Upload file lên R2 theo pattern presign → PUT thẳng (nhị phân KHÔNG đi qua API — cùng cơ chế
 * với đính kèm chat, ADR 0009 §5). Đây là chỗ dùng chung cho ảnh xe / ảnh gian hàng; chat
 * re-import `uploadToR2` từ đây (skill shared-code).
 */

export type UploadPresign = components['schemas']['UploadPresignDto'];

/** Upload thẳng lên R2 qua presigned PUT — fetch trần, không cookie/envelope của api-client. */
export async function uploadToR2(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!res.ok) throw new Error('Tải tệp lên thất bại');
}

/**
 * Check MIME + dung lượng TRƯỚC khi presign — báo lỗi tức thì thay vì để R2 từ chối.
 * Trần thật vẫn ở backend (DTO validate + Content-Length ký trong URL).
 */
export function validateImageFile(file: File): string | null {
  if (!(IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Chỉ nhận ảnh JPG, PNG hoặc WebP';
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return `Ảnh tối đa ${Math.round(IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024)}MB`;
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

/** Presign logo/ảnh bìa gian hàng — cần quyền `tenant.update`. */
export const presignShopMedia = (file: File): Promise<UploadPresign> =>
  apiPost<UploadPresign>('/uploads/shop-media/presign', presignBody(file));

/** Presign ảnh banner trang chủ — cần quyền `platform.banners.manage`. */
export const presignBannerImage = (file: File): Promise<UploadPresign> =>
  apiPost<UploadPresign>('/platform/banners/presign', presignBody(file));

/** Presign 1 file ảnh rồi PUT lên R2, trả URL công khai để lưu vào form/API. */
export async function uploadImage(
  file: File,
  presign: (file: File) => Promise<UploadPresign>,
): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);
  const ticket = await presign(file);
  await uploadToR2(ticket.uploadUrl, file);
  return ticket.publicUrl;
}
