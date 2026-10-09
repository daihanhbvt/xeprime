import type { DocumentUploadMimeType } from '@xeprime/types';

/**
 * Chữ ký byte đầu (magic bytes) của các định dạng được duyệt.
 *
 * Content-Type do CLIENT khai lúc PUT lên R2 nên không tin được: một tệp bất kỳ đổi đuôi thành
 * `.jpg` vẫn PUT được. Mọi luồng tải tệp riêng tư đối chiếu NỘI DUNG THẬT ở đây trước khi cho tệp
 * thành hợp lệ — một bảng cho mọi luồng, để không luồng nào kiểm lỏng hơn luồng khác.
 *
 * WebP: `RIFF....WEBP` — kiểm hai đoạn (4 byte offset 0 và 4 byte offset 8).
 */
const FILE_SIGNATURES: Record<DocumentUploadMimeType, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (b) =>
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    b.length >= 12 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50, // WEBP
};

/** Số byte đầu cần đọc để kiểm mọi chữ ký ở trên. */
export const FILE_SIGNATURE_PREFIX_BYTES = 12;

/** Nội dung có đúng là định dạng `mimeType` đã khai không. MIME ngoài danh sách ⇒ `false`. */
export function matchesFileSignature(mimeType: string, bytes: Uint8Array | null): boolean {
  if (!bytes) return false;
  const check = FILE_SIGNATURES[mimeType as DocumentUploadMimeType];
  return check ? check(bytes) : false;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}
