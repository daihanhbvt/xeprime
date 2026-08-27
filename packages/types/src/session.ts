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
 * Ở `apps/web` hàm này chạy trong proxy, và ở đó `process.env.SESSION_COOKIE_NAME` được đọc lúc
 * CHẠY chứ không bị nhúng cứng lúc build — Next chỉ nhúng `NEXT_PUBLIC_*` (đo trực tiếp trên Next
 * 16 + Turbopack, 27/08/2026). Nghĩa là tiến trình `next start` phải có biến này trong môi trường
 * của nó, không phải chỉ máy build có là đủ.
 */
export function resolveSessionCookieName(env: { SESSION_COOKIE_NAME?: string } = {}): string {
  const raw = env.SESSION_COOKIE_NAME?.trim();
  return raw && raw.length > 0 ? raw : SESSION_COOKIE_NAME_DEFAULT;
}
