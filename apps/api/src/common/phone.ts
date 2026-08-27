import { normalizeVnPhone, toLocalVnPhone } from '@xeprime/types';

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

/**
 * Cài đặt thật nằm ở `@xeprime/types/phone` — frontend cần ĐÚNG phép chuẩn hoá này để biết SĐT
 * đang nhập có trùng SĐT tài khoản hay không (quyết định hiện bước OTP). Hai bản riêng sẽ trôi
 * khỏi nhau. Ở đây chỉ tái xuất dưới tên cũ để không phải sửa hàng chục chỗ import.
 */
export const normalizePhone = normalizeVnPhone;
export const toLocalPhone = toLocalVnPhone;

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
