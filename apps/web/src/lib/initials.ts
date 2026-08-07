const FALLBACK_INITIAL = '?';

/**
 * Chữ cái đầu để dựng avatar khi không có ảnh.
 *
 * Trước Wave 1C logic này được chép tay ở 9 nơi (`Topbar`, `ManageUserCard`, `AccountView`,
 * `MarketHeader`, `ShopHeader`, `BrandMark`, `FeaturedHosts`, `members/page`, `admin/staff/page`)
 * với ba fallback khác nhau: `'?'`, `'K'`, và chuỗi rỗng. Gom về một chỗ để avatar không bao giờ
 * rỗng và mọi nơi hiển thị giống nhau.
 *
 * Dùng `[...value]` chứ không `charAt(0)`: tên tiếng Việt có dấu vẫn nằm gọn trong BMP nhưng
 * `charAt` sẽ cắt đôi ký tự ngoài BMP (emoji trong tên gian hàng là có thật), tạo ra ký tự hỏng.
 */
export function initialOf(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return FALLBACK_INITIAL;
  return ([...trimmed][0] ?? FALLBACK_INITIAL).toLocaleUpperCase('vi-VN');
}
