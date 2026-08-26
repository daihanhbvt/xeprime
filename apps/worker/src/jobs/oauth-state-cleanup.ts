import type { PrismaClient } from '@xeprime/prisma';

/**
 * Dọn `oauth_states` đã hết hạn — ADR 0019.
 *
 * Bảng này chỉ có ghi và xoá: mỗi lần bấm "Đăng nhập với Google" thêm một hàng sống 10 phút, và
 * phần lớn hàng KHÔNG bao giờ được tiêu thụ (người dùng bỏ giữa chừng, bot quét endpoint công
 * khai). Không dọn thì nó phình vô hạn mà không màn hình nào để lộ ra điều đó.
 *
 * Xoá theo `expires_at`, KHÔNG theo `consumed_at`: hàng chưa tiêu thụ mới là phần lớn rác, và
 * một hàng đã hết hạn thì dù tiêu thụ hay chưa cũng không còn giá trị gì.
 *
 * Đây là việc DỌN DẸP, không phải ghi trạng thái nghiệp vụ — `OauthStateService` vẫn là chỗ duy
 * nhất phát và tiêu thụ `state`. Worker là tiến trình riêng nên không dùng lại được service của
 * Nest; một câu `deleteMany` theo thời gian là toàn bộ những gì nó cần biết.
 */
export async function purgeExpiredOauthStates(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.oauthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
