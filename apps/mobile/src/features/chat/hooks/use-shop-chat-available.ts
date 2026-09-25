import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { chatApi } from '@/features/chat/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { queryKeys } from '@/queries/query-keys';

/**
 * "Khách này có nhắn được cho gian hàng không" — câu trả lời DUY NHẤT cho cả nút lẫn chỗ đặt nút.
 *
 * Tách khỏi `ShopChatButton` vì một component tự trả `null` chỉ giấu được CHÍNH NÓ: cái khung
 * chia đôi bề ngang bọc ngoài vẫn đứng nguyên, và nút hành động bên cạnh vẫn chỉ được một nửa
 * màn hình. Nơi bày bố cục phải biết trước để bỏ hẳn ô, thay vì bỏ ruột của ô.
 *
 * Ba lớp, trả lời ba câu khác nhau:
 * - GIAN HÀNG CỦA CHÍNH MÌNH — khu quản lý có lối "Xem gian hàng" mở đúng trang công khai này,
 *   nên người bán vào đây luôn. Với họ nút nhắn tin mở một hội thoại `customerUserId` = chính
 *   họ với `tenantId` = chính gian hàng họ: một thread tự nói với mình, hiện ở cả hai hộp thư
 *   và không đường nào đóng lại được. Phiên đã mang sẵn gian hàng của người dùng (`me.tenant`)
 *   nên câu này trả lời được ngay, không tốn một lượt hỏi và không nhấp nháy hiện-rồi-mất.
 * - `publicChatOpen` — gian hàng có mở hộp thư công khai không. Có thì khỏi hỏi server.
 * - `eligibility` — chủ xe cá nhân KHÔNG mở hộp thư công khai; kênh chỉ mở sau khi khách đã gửi
 *   một yêu cầu thuê (`CHAT_REQUIRES_BOOKING`). Chỉ hỏi khi cần.
 *
 * Hai lớp sau là chuyện GIAO DIỆN — cổng thật của chúng nằm ở `POST /conversations`. Lớp đầu thì
 * KHÔNG: backend hiện chưa chặn người của gian hàng tự mở hội thoại với chính gian hàng mình
 * (`ChatService.canCustomerOpenChat` cho tuyến gói qua thẳng), nên chừng nào chưa có cổng ở đó,
 * đây là chỗ DUY NHẤT giữ. Gọi API trực tiếp vẫn tạo được thread tự-nhắn-mình; và web cũng chưa
 * có lớp này, nên cùng một chủ shop mở `/shops/<slug>` của mình trên web vẫn thấy nút.
 */
export function useShopChatAvailable(shopSlug: string, publicChatOpen: boolean): boolean {
  const { data: me } = useCurrentUser();
  const isOwnShop = me?.tenant?.slug === shopSlug;

  const eligibility = useQuery({
    queryKey: queryKeys.chat.eligibility(shopSlug),
    queryFn: () => chatApi.eligibility(shopSlug),
    enabled: !publicChatOpen && !isOwnShop,
    staleTime: STALE_TIME.STANDARD,
  });

  if (isOwnShop) return false;

  return publicChatOpen || eligibility.data?.canChat === true;
}
