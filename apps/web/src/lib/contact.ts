import { toLocalVnPhone } from '@xeprime/types';

/**
 * Liên kết liên hệ một khách/đối tác từ một số điện thoại.
 *
 * Có ba bề mặt cần chúng (inbox yêu cầu, chi tiết đơn, hồ sơ khách) và cả ba đang tự ghép chuỗi
 * `tel:${phone}` tại chỗ. Ghép tay chạy được với `0901234567` nhưng hỏng im lặng với dạng
 * `+84901234567` hay số có khoảng trắng — đúng những dạng dữ liệu thật mang theo. Chuẩn hoá
 * một lần ở đây, dùng CHÍNH `toLocalVnPhone` của `@xeprime/types` (nguồn duy nhất của phép quy
 * đổi `0` / `84` / `+84`) thay vì viết lại một biến thể thứ hai sẽ trôi.
 */

/** `tel:0901234567`. `null` khi không có số để gọi — chỗ gọi hiện chữ thay vì một link chết. */
export function telHref(phone: string | null | undefined): string | null {
  const normalized = normalizeContactPhone(phone);
  return normalized ? `tel:${normalized}` : null;
}

/**
 * `https://zalo.me/0901234567`.
 *
 * Zalo định danh người dùng bằng SĐT, nên link chỉ đúng khi số ở dạng nội địa — `+84…` mở ra
 * một trang tìm kiếm rỗng. Mở ở tab mới (`target="_blank" rel="noopener noreferrer"`) là việc
 * của chỗ gọi; hàm này chỉ dựng URL.
 */
export function zaloHref(phone: string | null | undefined): string | null {
  const normalized = normalizeContactPhone(phone);
  return normalized ? `https://zalo.me/${normalized}` : null;
}

/** Dạng nội địa `0xxxxxxxxx` đã bỏ khoảng trắng; `null` nếu rỗng sau khi chuẩn hoá. */
function normalizeContactPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = toLocalVnPhone(phone);
  return normalized.length > 0 ? normalized : null;
}
