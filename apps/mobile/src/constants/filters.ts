/**
 * Sentinel "mọi giá trị" của các bộ lọc trên giao diện.
 *
 * KHÔNG endpoint nào nhận `status=all` — màn hình bỏ hẳn tham số khi người dùng chọn mục này.
 * Có mặt ở đây, không phải trong từng feature, vì mười một màn từng tự khai `const ALL = 'all'`:
 * một chuỗi ba ký tự trùng nhau do may mắn chứ không do ràng buộc nào, và nếu một màn đổi thành
 * `'ALL'` thì lỗi chỉ lộ ra khi server trả rỗng.
 */
export const FILTER_ALL = 'all';
