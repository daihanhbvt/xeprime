import type { AccountRealm } from './account-realm';

/**
 * Tên cookie phiên — ADR 0002, tách theo realm ở ADR 0053.
 *
 * Vì sao công thức này phải NẰM CHUNG: API phát cookie, còn `apps/web/src/proxy.ts` phải đọc ĐÚNG
 * cookie đó để chặn khu cần đăng nhập. Trước đây web gõ thẳng `'xp_session'` trong khi API đọc
 * env — đổi tên ở env là proxy im lặng ngừng thấy phiên, mọi người dùng bị đá về trang login mà
 * không có lỗi nào để lần.
 *
 * Luật: KHÔNG gõ tên cookie ở bất kỳ đâu khác. Cả hai phía dùng `resolveSessionCookieName`.
 */
export const SESSION_COOKIE_NAME_DEFAULT = 'xp_session';

/**
 * Tên cookie phiên của MỘT realm: `<gốc>_<realm>` — vd `xp_session_partner`, staging
 * `xp_session_stg_partner`. Mỗi realm một tên (ADR 0053 điều 4): cookie host-only đã không đi chéo
 * site ở production, còn tên riêng là thứ giữ ba phiên tách nhau ở máy dev, nơi cả ba khu chung
 * một host `localhost`.
 *
 * Ở `apps/web` hàm này chạy trong proxy, và ở đó `process.env.SESSION_COOKIE_NAME` được đọc lúc
 * CHẠY chứ không bị nhúng cứng lúc build — Next chỉ nhúng `NEXT_PUBLIC_*` (đo trên Next 16 +
 * Turbopack, 27/08/2026). Tiến trình `next start` phải có biến này trong môi trường của nó.
 */
export function resolveSessionCookieName(
  env: { SESSION_COOKIE_NAME?: string },
  realm: AccountRealm,
): string {
  const raw = env.SESSION_COOKIE_NAME?.trim();
  const base = raw && raw.length > 0 ? raw : SESSION_COOKIE_NAME_DEFAULT;
  return `${base}_${realm}`;
}

/*
 * Thời hạn phiên web và OTP — CHÍNH SÁCH sản phẩm/bảo mật, giống nhau ở mọi môi trường, nên là
 * hằng số chứ không phải biến env (dọn env 05/10/2026). Đổi là đổi code qua review — không phải
 * sửa một biến ở một môi trường rồi quên môi trường kia.
 */

/** Phiên web (cookie httpOnly — ADR 0002): sống 7 ngày kể từ lúc đăng nhập. */
export const SESSION_TTL_DAYS = 7;

/**
 * Mã OTP (SĐT và email dùng chung một chính sách). Cooldown và trần gửi/giờ đếm theo SĐT/email
 * trên mọi realm; trần nhập sai khoá mã để chống dò mã 6 số. Web dùng `RESEND_COOLDOWN_SECONDS`
 * cho đồng hồ "Gửi lại" — gửi sớm hơn là chắc chắn bị server từ chối.
 */
export const OTP_POLICY = {
  /** Số chữ số của mã — ô nhập mã (một dòng hay sáu ô) và phép tự gửi khi gõ đủ đều đọc từ đây. */
  CODE_LENGTH: 6,
  TTL_MINUTES: 5,
  RESEND_COOLDOWN_SECONDS: 60,
  MAX_SENDS_PER_HOUR: 5,
  MAX_ATTEMPTS: 5,
} as const;
