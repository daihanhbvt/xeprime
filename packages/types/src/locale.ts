/**
 * Danh sách ngôn ngữ giao diện — ADR 0012.
 *
 * Ở CHUNG vì có hai phía cùng phải biết: `apps/web` chọn bản dịch, và từ ADR 0019 `apps/api`
 * nhận `?locale=` ở `GET /auth/social/:provider` rồi chuyển tiếp cho màn đồng ý của
 * Google/Facebook — màn đó do PROVIDER render, nên nếu API không nói ngôn ngữ ra thì khách đang
 * đọc tiếng Anh sẽ nhảy sang một popup tiếng Việt ngay giữa luồng đăng nhập.
 *
 * Chỉ những thứ KHÔNG phụ thuộc môi trường nằm ở đây. THUỘC TÍNH cookie (`httpOnly`, `secure`,
 * `maxAge`) và bản đồ `Intl` vẫn ở `apps/web/src/i18n/config.ts`: chúng là chuyện của trình
 * duyệt và của Next.
 */

/** Thứ tự ở đây cũng là thứ tự hiện trong bộ chuyển ngôn ngữ. */
export const SUPPORTED_LOCALES = ['vi', 'en'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Tiếng Việt là mặc định VÀ là bản dự phòng: khách lần đầu (chưa có cookie) luôn thấy tiếng
 * Việt, kể cả khi trình duyệt khai báo `Accept-Language: en`. Đây là quyết định SEO — trang
 * công khai được index bằng tiếng Việt trên cùng một URL.
 */
export const DEFAULT_LOCALE: AppLocale = 'vi';

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Giá trị thô (cookie, query string, tham số Server Action) → locale hợp lệ. Không hợp lệ ⇒ tiếng Việt. */
export function resolveAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Tên cookie chở lựa chọn ngôn ngữ (ADR 0012).
 *
 * Ở CHUNG từ 10/09/2026: app native mở trang pháp lý của web trong WebView và phải gửi kèm
 * cookie này ở request đầu, nếu không người đang dùng app tiếng Anh nhận về một trang điều
 * khoản tiếng Việt (web đọc locale ở phía server, và ADR 0012 cấm `?lang=`). Chỉ TÊN nằm ở
 * đây — thuộc tính cookie vẫn thuộc về phía đặt nó, tức web.
 */
export const LOCALE_COOKIE_NAME = 'XP_LOCALE';
