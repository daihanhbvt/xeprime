import { ApiClientError } from '@/lib/api-client';
import { ImageUploadError } from '@/lib/r2-image-upload';

/**
 * Câu mặc định khi lỗi không mang câu nào — NGUYÊN VĂN hằng `FALLBACK_ERROR_MESSAGE` của
 * `apps/web/src/services/api-client.ts`, để hai client nói cùng một câu.
 */
const FALLBACK_ERROR_MESSAGE = 'Không kết nối được máy chủ. Thử lại sau.';

/**
 * Câu lỗi NGUYÊN VĂN của backend — bản native của `getErrorMessage` bên web.
 *
 * App có hai cách nói một lỗi API, và mỗi màn phải dùng ĐÚNG cách mà màn tương ứng bên web đang
 * dùng (người dùng đọc hai client như một sản phẩm):
 *
 * - `useErrorMessage()` — dịch theo MÃ lỗi (`Errors.code.*`). Web dùng ở phần lớn các màn.
 * - `getErrorMessage()` (hàm này) — `message` backend trả về (tiếng Việt, thường cụ thể hơn: tên
 *   khách trùng số điện thoại, mốc KM đã ghi…). Web còn dùng ở ~50 màn; mỗi chỗ gọi hàm này bên
 *   app là bản đối ứng của đúng một chỗ gọi `getErrorMessage` bên web.
 *
 * Khác web ở đúng một chỗ, vì nền tảng: tải ảnh ở app bọc lỗi API trong `ImageUploadError`
 * (`r2-image-upload.ts`) để biết hỏng ở chặng nào — câu thật nằm ở `cause`, nên bóc ra trước.
 * Web gọi thẳng API nên không có lớp bọc đó.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ImageUploadError && error.cause !== undefined) {
    return getErrorMessage(error.cause);
  }
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message || FALLBACK_ERROR_MESSAGE;
  return FALLBACK_ERROR_MESSAGE;
}
