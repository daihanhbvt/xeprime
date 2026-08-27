/**
 * Ngoại lệ của `i18n:audit` — MỖI mục phải có lý do, và lý do phải là "chuỗi này không bao
 * giờ được dịch", không phải "chưa kịp dịch".
 *
 * Cố ý KHÔNG có ignore theo thư mục hay theo mẫu: một ignore rộng che đúng thứ cần thấy, và
 * lần sau không ai dám bỏ nó ra. Danh sách này phải ngắn; nếu nó dài ra thì lỗi nằm ở bộ dò,
 * hãy sửa bộ dò.
 *
 * `file` (tuỳ chọn) thu hẹp ngoại lệ về đúng một file — dùng khi cùng một chuỗi ở nơi khác
 * VẪN phải dịch.
 */
export const AUDIT_ALLOWLIST = [
  {
    text: 'XePrime',
    reason: 'Tên thương hiệu — giống nhau ở mọi ngôn ngữ.',
  },
  {
    text: 'Prime',
    reason: 'Rút gọn của thương hiệu XePrime trong logo.',
  },
  {
    text: 'Google',
    reason: 'Tên nhà cung cấp đăng nhập — không dịch tên riêng.',
  },
  {
    text: 'Facebook',
    reason: 'Tên nhà cung cấp đăng nhập — không dịch tên riêng.',
  },
  {
    text: 'Zalo',
    reason: 'Tên nhà cung cấp đăng nhập — không dịch tên riêng.',
  },
  {
    text: 'Apple',
    reason: 'Tên nhà cung cấp đăng nhập — không dịch tên riêng.',
  },
  {
    text: 'Instagram',
    reason: 'Tên mạng xã hội — danh từ riêng, không dịch.',
  },
  {
    text: 'TikTok',
    reason: 'Tên mạng xã hội — danh từ riêng, không dịch.',
  },
  {
    text: 'App Store',
    reason: 'Tên cửa hàng ứng dụng của Apple — giữ nguyên ở mọi ngôn ngữ (yêu cầu thương hiệu).',
  },
  {
    text: 'Google Play',
    reason: 'Tên cửa hàng ứng dụng của Google — giữ nguyên ở mọi ngôn ngữ (yêu cầu thương hiệu).',
  },
];
