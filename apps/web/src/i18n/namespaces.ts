/**
 * Danh sách namespace message — MỘT nguồn cho cả ba nơi cần biết nó:
 * `messages/<locale>/index.ts` (nạp lúc chạy), `scripts/i18n-check.mjs` (đối chiếu hai ngôn
 * ngữ) và test toàn vẹn.
 *
 * Chia theo TÍNH SỞ HỮU của tính năng, không theo màn hình: một màn hình có thể dùng nhiều
 * namespace, nhưng một chuỗi chỉ thuộc về đúng một tính năng. Chuỗi thật sự dùng chung ở mọi
 * nơi ("Lưu", "Huỷ", "Đang tải") nằm ở `common`, KHÔNG chép vào từng tính năng.
 *
 * Tên file kebab-case ↔ tên namespace PascalCase. Thêm namespace = thêm ở đây + tạo file JSON
 * cho CẢ HAI ngôn ngữ + khai báo ở hai file `index.ts`; `pnpm i18n:check` fail nếu lệch.
 *
 * Danh sách này lớn dần theo tiến độ i18n hoá: namespace của một tính năng được thêm ĐÚNG LÚC
 * tính năng đó được chuyển sang `t(...)`, không tạo sẵn file rỗng. Một namespace rỗng là chuỗi
 * chết nằm trong bundle và là lời hứa suông rằng khu vực đó đã dịch xong — `i18n:check` từ chối
 * nó. Phần còn lại (cổng quản lý và các tính năng ở Phase 3) vẫn đang dùng chuỗi tiếng Việt
 * trong mã; `pnpm i18n:audit` là bản kiểm kê chính xác những gì còn lại.
 */
export const MESSAGE_NAMESPACES = [
  // — Dùng chung mọi nơi —
  { file: 'common', namespace: 'Common' },
  { file: 'navigation', namespace: 'Navigation' },
  { file: 'domain', namespace: 'Domain' },
  { file: 'errors', namespace: 'Errors' },

  // — Khu công khai / khách hàng —
  { file: 'auth', namespace: 'Auth' },
  { file: 'home-search', namespace: 'HomeSearch' },
  { file: 'marketplace', namespace: 'Marketplace' },
  { file: 'listings', namespace: 'Listings' },
  { file: 'shops', namespace: 'Shops' },
  { file: 'chat', namespace: 'Chat' },
  { file: 'trips', namespace: 'Trips' },
  { file: 'account', namespace: 'Account' },

  // — Cổng quản lý —
  { file: 'manage-common', namespace: 'ManageCommon' },
  { file: 'shop-onboarding', namespace: 'ShopOnboarding' },
  { file: 'booking-requests', namespace: 'BookingRequests' },
  { file: 'bookings', namespace: 'Bookings' },
  { file: 'vehicles', namespace: 'Vehicles' },
  { file: 'customers', namespace: 'Customers' },
  // Mới có màn Công nợ; sổ Thu-Chi vẫn còn chuỗi thô — xem `i18n:audit`.
  { file: 'finance', namespace: 'Finance' },
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number]['namespace'];
