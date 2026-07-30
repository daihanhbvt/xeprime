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
