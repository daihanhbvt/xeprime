import type { PrismaClient } from '@xeprime/prisma';

export interface OauthCleanupResult {
  states: number;
  nativeCodes: number;
  webSessions: number;
  loginThrottles: number;
}

/** Bộ đếm đăng nhập sai không đổi trong ngần này và không còn khoá ⇒ không còn giá trị gì. */
const LOGIN_THROTTLE_IDLE_MS = 24 * 60 * 60 * 1000;

/**
 * Dọn các bảng ngắn hạn của đăng nhập — ADR 0019 · ADR 0076.
 *
 * `oauth_states` (10 phút) và `native_auth_codes` (60 giây) đều chỉ có ghi và xoá, và phần lớn
 * hàng **không bao giờ được tiêu thụ**: người dùng bỏ giữa chừng, bot quét endpoint công khai,
 * app bị kill trước khi kịp đổi mã. `web_sessions` sinh một hàng mỗi lần đăng nhập web và chỉ
 * vô dụng khi đã HẾT HẠN (hàng bị thu hồi mà chưa hết hạn vẫn giữ — nó là lịch sử "vì sao phiên
 * chết"). `login_throttles` sinh một hàng cho mỗi định danh từng gõ sai mật khẩu. Không dọn thì cả
 * bốn phình vô hạn mà không màn hình nào để lộ ra điều đó.
 *
 * Xoá theo `expires_at`, KHÔNG theo `consumed_at`: hàng chưa tiêu thụ mới là phần lớn rác, và
 * một hàng đã hết hạn thì dù tiêu thụ hay chưa cũng không còn giá trị gì.
 *
 * Đây là việc DỌN DẸP, không phải ghi trạng thái nghiệp vụ — `OauthStateService`,
 * `NativeAuthCodeService`, `SessionService` và `LoginThrottleService` vẫn là chỗ duy nhất phát và
 * tiêu thụ. Worker là tiến trình riêng nên không dùng lại được service của Nest; một câu
 * `deleteMany` theo thời gian là toàn bộ những gì nó cần biết.
 */
export async function purgeExpiredOauthStates(prisma: PrismaClient): Promise<OauthCleanupResult> {
  const now = new Date();
  const idleBefore = new Date(now.getTime() - LOGIN_THROTTLE_IDLE_MS);

  const [states, nativeCodes, webSessions, loginThrottles] = await Promise.all([
    prisma.oauthState.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.nativeAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.webSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.loginThrottle.deleteMany({
      where: {
        updatedAt: { lt: idleBefore },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
    }),
  ]);

  return {
    states: states.count,
    nativeCodes: nativeCodes.count,
    webSessions: webSessions.count,
    loginThrottles: loginThrottles.count,
  };
}
