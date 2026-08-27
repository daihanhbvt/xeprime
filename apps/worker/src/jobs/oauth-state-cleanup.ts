import type { PrismaClient } from '@xeprime/prisma';

export interface OauthCleanupResult {
  states: number;
  nativeCodes: number;
}

/**
 * Dọn hai bảng ngắn hạn của luồng đăng nhập mạng xã hội — ADR 0019.
 *
 * `oauth_states` (10 phút) và `native_auth_codes` (60 giây) đều chỉ có ghi và xoá, và phần lớn
 * hàng **không bao giờ được tiêu thụ**: người dùng bỏ giữa chừng, bot quét endpoint công khai,
 * app bị kill trước khi kịp đổi mã. Không dọn thì cả hai phình vô hạn mà không màn hình nào để
 * lộ ra điều đó.
 *
 * Xoá theo `expires_at`, KHÔNG theo `consumed_at`: hàng chưa tiêu thụ mới là phần lớn rác, và
 * một hàng đã hết hạn thì dù tiêu thụ hay chưa cũng không còn giá trị gì.
 *
 * Đây là việc DỌN DẸP, không phải ghi trạng thái nghiệp vụ — `OauthStateService` và
 * `NativeAuthCodeService` vẫn là chỗ duy nhất phát và tiêu thụ. Worker là tiến trình riêng nên
 * không dùng lại được service của Nest; một câu `deleteMany` theo thời gian là toàn bộ những gì
 * nó cần biết.
 */
export async function purgeExpiredOauthStates(prisma: PrismaClient): Promise<OauthCleanupResult> {
  const now = new Date();

  const [states, nativeCodes] = await Promise.all([
    prisma.oauthState.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.nativeAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  return { states: states.count, nativeCodes: nativeCodes.count };
}
