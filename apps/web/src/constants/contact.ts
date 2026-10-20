/**
 * Tổng đài hỗ trợ của sàn, in trên trang chủ (khối "Đăng ký trở thành đối tác") theo design v2.
 *
 * `display` là cách viết cho người đọc; `tel` là dạng quay số quốc tế cho liên kết `tel:` — tách
 * hai trường để không phải bóc khoảng trắng ở mỗi nơi dùng. Số là dữ liệu, không dịch.
 */
export const SUPPORT_HOTLINE = {
  display: '0968 789 789',
  tel: '+84968789789',
} as const;
