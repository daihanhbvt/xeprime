/**
 * Chuẩn hoá số điện thoại Việt Nam — dùng CHUNG giữa `apps/api` và `apps/web`.
 *
 * Đây là logic cross-tuyến thật sự: backend quyết định "SĐT gửi lên có trùng SĐT tài khoản
 * không" để cho phép bỏ qua OTP, còn frontend phải trả lời đúng CÙNG câu hỏi đó để biết có hiện
 * bước OTP hay không. Hai bản cài đặt lệch nhau một dấu `+` là frontend hứa bỏ qua OTP còn
 * backend chặn — người dùng bấm gửi rồi ăn lỗi.
 */

/** Dạng người dùng được phép nhập ở các form xác thực: `0xxxxxxxxx` hoặc `+84xxxxxxxxx`. */
export const VN_PHONE_PATTERN = /^(0|\+84)\d{9}$/;

/** `0xxxxxxxxx` / `+84xxxxxxxxx` → `84xxxxxxxxx`. Dạng LƯU của `users.phone`. */
export function normalizeVnPhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s.-]/g, '');
  if (trimmed.startsWith('+84')) return `84${trimmed.slice(3)}`;
  if (trimmed.startsWith('84')) return trimmed;
  if (trimmed.startsWith('0')) return `84${trimmed.slice(1)}`;
  return trimmed;
}

/** `84xxxxxxxxx` / `+84xxxxxxxxx` → `0xxxxxxxxx`. Dạng HIỂN THỊ. */
export function toLocalVnPhone(raw: string): string {
  const trimmed = raw.trim().replace(/[\s.-]/g, '');
  if (trimmed.startsWith('+84')) return `0${trimmed.slice(3)}`;
  if (trimmed.startsWith('84')) return `0${trimmed.slice(2)}`;
  return trimmed;
}

/** Hai chuỗi có phải cùng một số hay không — bỏ qua khác biệt `0` / `84` / `+84` / dấu cách. */
export function isSameVnPhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeVnPhone(a) === normalizeVnPhone(b);
}
