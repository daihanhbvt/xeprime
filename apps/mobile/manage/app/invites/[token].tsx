import { useLocalSearchParams } from 'expo-router';
import { InviteAnswerScreen } from '@/features/members/InviteAnswerScreen';

/**
 * Người được mời mở thư và quyết định — `/invites/<token>`.
 *
 * KHÔNG bọc `RequireSession`, và đó là điểm mấu chốt: người mở màn này chưa thuộc gian hàng nào và
 * có thể còn chưa có tài khoản. Bắt họ đăng nhập trước khi được đọc mình đang được mời làm gì là
 * đúng cái mà web tránh bằng cách để trang này ở nhóm `(public)`.
 *
 * Màn tự lo phần "chưa đăng nhập thì chưa trả lời được"; `accept`/`decline` cần phiên, và server
 * còn đòi đúng tài khoản mang email được mời.
 */
export default function InviteAnswerRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InviteAnswerScreen token={token} />;
}
