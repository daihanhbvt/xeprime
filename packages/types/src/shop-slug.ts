/**
 * SLUG của trang gian hàng công khai — `xeprime.vn/<slug>` (biên bản họp 19/11/2026: rút gọn link
 * gian hàng, bỏ chữ `shops` và hậu tố mã; trước đó là `/shops/<tên>-<6 ký tự id>`).
 *
 * Trang gian hàng nằm NGAY Ở GỐC site khách, chung tầng với mọi trang khác (`/search`, `/trips`…)
 * và với các đường dẫn cũ còn được chuyển hướng (`/login`, `/vehicles`…). Một gian hàng tên "Search"
 * mà nhận slug `search` thì hoặc che mất trang tìm xe, hoặc trang của nó không bao giờ mở được —
 * nên mọi tên dưới đây KHÔNG BAO GIỜ được cấp làm slug. Test `shop-slug-reserved.test.ts` ở web quét
 * thư mục `app/` và `public/` để bắt route mới quên thêm vào đây.
 *
 * Danh sách cố ý rộng hơn số route đang có (vài tên dự phòng như `news`, `blog`, `help`): thêm một
 * tên vào đây sau khi đã có gian hàng mang nó là việc phải đổi slug của người ta.
 */
export const RESERVED_SHOP_SLUGS: ReadonlySet<string> = new Set([
  // Trang của site khách (app/(public), app/(auth)) và route hệ thống
  'about',
  'account',
  'api',
  'app',
  'app-return',
  'chat',
  'delete-account',
  'insurance',
  'legal',
  'list-your-vehicle',
  'listings',
  'payment',
  'reset-password',
  'search',
  'shops',
  'support',
  'trips',
  // Tiền tố nội bộ của site partner / quản trị
  'admin',
  'manage',
  // Thư mục tĩnh trong public/
  'auth',
  'body-types',
  'booking',
  'brand',
  'brands',
  'email',
  'home',
  'icons',
  'illustrations',
  'images',
  'owner-resources',
  'partner',
  'payment-methods',
  'states',
  // Đường dẫn cũ còn được chuyển hướng (proxy / legacy-redirects)
  'login',
  'register',
  'forgot-password',
  'administrators',
  'balance',
  'bookings',
  'calendar',
  'contracts-documents',
  'data-protection',
  'host-guide',
  'managed',
  'registration',
  'subscription',
  'tax',
  'vehicles',
  // Dự phòng cho trang sắp có / tên dễ gây nhầm
  'blog',
  'checkout',
  'contact',
  'en',
  'faq',
  'guide',
  'help',
  'logout',
  'news',
  'partners',
  'pricing',
  'privacy',
  'settings',
  'shop',
  'signup',
  'sitemap',
  'static',
  'terms',
  'tin-tuc',
  'vi',
  'www',
  'xeprime',
]);

/** Độ dài tối đa của phần tên trong slug — cột `tenants.slug` là VARCHAR(120), chừa chỗ hậu tố. */
export const SHOP_SLUG_BASE_MAX_LENGTH = 100;

/** Tên được cấp làm slug không — chữ thường, số, gạch nối, không thuộc danh sách cấm. */
export function isReservedShopSlug(slug: string): boolean {
  return RESERVED_SHOP_SLUGS.has(slug.toLowerCase());
}

/** "Hạnh Huế" ⇒ `hanh-hue`: bỏ dấu, `đ` ⇒ `d`, chữ thường, mọi ký tự khác thành một gạch nối. */
export function slugifyShopName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SHOP_SLUG_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');
}
