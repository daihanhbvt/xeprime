/**
 * Link cửa hàng của app KHÁCH (XePrime, `vn.xeprime.customerapp`) - đọc từ env để đổi link chỉ là
 * sửa `.env`/GitHub Environment. `NEXT_PUBLIC_*` vì Next nhúng lúc build cho cả Client Component.
 * Thiếu biến thì rơi về đúng link đã phát hành: mã QR không bao giờ được thành mã rỗng.
 */
const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
  'https://apps.apple.com/vn/app/xeprime/id6831492287';
const PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() ||
  'https://play.google.com/store/apps/details?id=vn.xeprime.customerapp';

/**
 * Hai mã QR tải ứng dụng - dùng ở chân trang, banner trang chủ VÀ trang `/app`, qua `AppStoreQr`.
 * Vẽ bằng `QRCode` của antd từ chính link store (không phải ảnh tĩnh), nên đổi link là đổi mã.
 *
 * Thứ tự Google Play → App Store theo design v2 (ADR 0062). Tên cửa hàng là DANH TỪ RIÊNG, không
 * dịch và không cần khoá message.
 */
export const APP_DOWNLOAD_QR: ReadonlyArray<{
  key: 'ios' | 'android';
  store: string;
  value: string;
}> = [
  { key: 'android', store: 'Google Play', value: PLAY_STORE_URL },
  { key: 'ios', store: 'App Store', value: APP_STORE_URL },
];
