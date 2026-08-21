/**
 * Quy ước dùng chung của MỌI danh sách có lọc + phân trang.
 *
 * Ba giá trị dưới đây từng được gõ tay rải rác: sentinel `'all'` xuất hiện ở hơn 40 file (ô
 * chọn, hàm dựng query, và cả `useUrlFilters`), còn số 20 được khai báo lại trong 16 hằng
 * `*_DEFAULT_LIMIT` riêng biệt. Cùng một quyết định viết ở nhiều nơi là nhiều dịp để chúng trôi
 * khỏi nhau — đổi mặc định 20 → 25 mà sót một chỗ thì hai bảng phân trang khác nhau.
 *
 * File này CỐ Ý không phụ thuộc gì: không React, không Next, không `@/services`. Nhờ vậy cả
 * component, hook lọc theo URL lẫn tầng gọi API đều import được mà không kéo theo tầng khác.
 */

/**
 * Giá trị "mọi trạng thái" của một ô lọc.
 *
 * Nó là **sentinel của giao diện**, không phải giá trị nghiệp vụ: không endpoint nào nhận
 * `status=all`. `useUrlFilters` xoá nó khỏi URL, `pickFilter` xoá nó khỏi query gửi lên API.
 */
export const ALL_FILTER = 'all';

/** Số dòng mặc định của một trang danh sách quản lý. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Giá trị ô lọc → tham số gửi API: rỗng hoặc {@link ALL_FILTER} thành `null` (bỏ hẳn tham số).
 *
 * Backend chỉ nhận giá trị hợp lệ của enum tương ứng; gửi `status=all` lên là chắc chắn 400.
 */
export function pickFilter(value: string | null | undefined): string | null {
  return value && value !== ALL_FILTER ? value : null;
}
