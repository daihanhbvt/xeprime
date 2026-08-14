/**
 * Tên cookie phiên — ADR 0002.
 *
 * Vì sao hằng số này phải NẰM CHUNG: API phát cookie theo `SESSION_COOKIE_NAME` (env), còn
 * `apps/web/src/proxy.ts` phải đọc ĐÚNG cookie đó để chặn `/manage/*`. Trước đây web gõ thẳng
 * `'xp_session'` trong khi API đọc env — đổi tên cookie ở env là proxy im lặng ngừng thấy phiên,
 * tức mọi người dùng đã đăng nhập bị đá về trang login mà không có lỗi nào để lần.
 *
 * Luật: KHÔNG gõ tên cookie ở bất kỳ đâu khác. Cả hai phía lấy giá trị theo cùng một công thức
 * `process.env.SESSION_COOKIE_NAME ?? SESSION_COOKIE_NAME_DEFAULT` (xem `resolveSessionCookieName`).
 */
export const SESSION_COOKIE_NAME_DEFAULT = 'xp_session';

/**
 * Giải tên cookie phiên từ env, có default dùng chung.
 *
 * Ở `apps/web` hàm này chạy trong proxy (Edge) — Next thay `process.env.SESSION_COOKIE_NAME`
 * bằng giá trị lúc build, nên biến phải có mặt khi build web (script build đã nạp `.env` gốc).
 */
export function resolveSessionCookieName(
  env: { SESSION_COOKIE_NAME?: string } = {},
): string {
  const raw = env.SESSION_COOKIE_NAME?.trim();
  return raw && raw.length > 0 ? raw : SESSION_COOKIE_NAME_DEFAULT;
}
