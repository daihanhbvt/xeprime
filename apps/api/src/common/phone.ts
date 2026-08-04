/**
 * Chuẩn hoá và hiển thị số điện thoại Việt Nam.
 *
 * Hệ đang lưu SĐT ở HAI dạng, có chủ đích và không gộp được:
 *  - `users.phone`: dạng `84xxxxxxxxx` (đi qua `normalizePhone` khi đăng nhập/OTP — khớp
 *    định dạng eSMS legacy, và là cột `@unique` nên phải chuẩn hoá trước khi ghi).
 *  - `bookings.customer_phone` / `booking_requests.customer_phone`: **giữ nguyên như shop/khách
 *    gõ** (`0xxxxxxxxx`, `+84…`, có dấu cách…) — đây là dữ liệu nghiệp vụ của shop, không phải
 *    định danh đăng nhập.
 *
 * Hệ quả: một ô "tra theo SĐT" chỉ so khớp một dạng thì gần như luôn trả về rỗng. Mọi chỗ tra
 * cứu dùng `phoneLookupVariants`, mọi chỗ hiển thị dùng `toLocalPhone` — để cùng một người
 * trông giống nhau trên mọi màn hình.
 */

/** `0xxxxxxxxx` / `+84xxxxxxxxx` → `84xxxxxxxxx` (như eSMS legacy). Dạng LƯU của `users.phone`. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+84')) return `84${trimmed.slice(3)}`;
  if (trimmed.startsWith('84')) return trimmed;
  if (trimmed.startsWith('0')) return `84${trimmed.slice(1)}`;
  return trimmed;
}

/** `84xxxxxxxxx` / `+84xxxxxxxxx` → `0xxxxxxxxx`. Dạng HIỂN THỊ (người Việt đọc số kiểu này). */
export function toLocalPhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+84')) return `0${trimmed.slice(3)}`;
  if (trimmed.startsWith('84')) return `0${trimmed.slice(2)}`;
  return trimmed;
}

/**
 * Mọi dạng lưu có thể có của một SĐT người dùng gõ vào ô tra cứu, để dùng với `{ in: [...] }`.
 *
 * Vẫn là so khớp CHÍNH XÁC (không `contains`): nhân viên hỗ trợ có sẵn số khách đọc cho, còn
 * cho tìm gần đúng thì ô tra cứu thành công cụ quét danh bạ khách hàng.
 */
export function phoneLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return [...new Set([trimmed, normalizePhone(trimmed), toLocalPhone(trimmed)])];
}
