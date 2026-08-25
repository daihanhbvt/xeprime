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
 * **MỘT GỐC, và gốc đó là `@xeprime/domain/messages`** (quyết định 24/08/2026): toàn bộ bó
 * message dùng chung cho web và app native — một khoá chỉ có một bản dịch để hai client không
 * bao giờ nói khác nhau. `apps/web/messages/<locale>/index.ts` chỉ còn là bảng gom của web;
 * `i18n:check` đối chiếu parity vi↔en trên gốc package và CHẶN file JSON mọc lại ở gốc web cũ.
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
  { file: 'domain', namespace: 'Domain' },
  { file: 'errors', namespace: 'Errors' },
  { file: 'navigation', namespace: 'Navigation' },

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
  { file: 'dashboard', namespace: 'Dashboard' },
  { file: 'shop-onboarding', namespace: 'ShopOnboarding' },
  { file: 'shop', namespace: 'Shop' },
  { file: 'booking-requests', namespace: 'BookingRequests' },
  { file: 'bookings', namespace: 'Bookings' },
  { file: 'vehicles', namespace: 'Vehicles' },
  { file: 'customers', namespace: 'Customers' },
  // Mới có màn Công nợ; sổ Thu-Chi vẫn còn chuỗi thô — xem `i18n:audit`.
  { file: 'finance', namespace: 'Finance' },
  // ⚠️ `mobile-shell` là VỎ app native (màn lỗi cấp app, not-found, điều hướng gốc), KHÔNG
  // phải "mọi chữ của mobile". Namespace vẫn chia theo TÍNH NĂNG, không theo client: màn
  // booking trên app dùng lại `bookings`/`booking-requests` như web, chuỗi xe dùng lại
  // `vehicles`. Chép chúng sang đây là tạo bản dịch thứ hai cho cùng một khoá — đúng thứ
  // gốc chung sinh ra để chặn.
  { file: 'mobile-shell', namespace: 'MobileShell', web: false },
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number]['namespace'];

/** Bó của web — bảng gom `messages/<locale>/index.ts` phải khớp đúng danh sách này. */
export const WEB_MESSAGE_NAMESPACES = MESSAGE_NAMESPACES.filter(
  (entry) => !('web' in entry && entry.web === false),
);
