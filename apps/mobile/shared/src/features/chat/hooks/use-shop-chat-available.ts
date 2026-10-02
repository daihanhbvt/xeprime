import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { chatApi } from '@/features/chat/api';
import { queryKeys } from '@/queries/query-keys';

/**
 * "Khách này có nhắn được cho gian hàng không" — câu trả lời DUY NHẤT cho cả nút lẫn chỗ đặt nút.
 * Cùng luật với `ShopChatButton` bên web (`!publicChatOpen && eligibility.canChat !== true` ⇒ ẩn).
 *
 * Tách khỏi `ShopChatButton` vì một component tự trả `null` chỉ giấu được CHÍNH NÓ: cái khung
 * chia đôi bề ngang bọc ngoài vẫn đứng nguyên, và nút hành động bên cạnh vẫn chỉ được một nửa
 * màn hình. Nơi bày bố cục phải biết trước để bỏ hẳn ô, thay vì bỏ ruột của ô.
 *
 * Hai lớp, trả lời hai câu khác nhau:
 * - `publicChatOpen` — gian hàng có mở hộp thư công khai không. Có thì khỏi hỏi server.
 * - `eligibility` — chủ xe cá nhân KHÔNG mở hộp thư công khai; kênh chỉ mở sau khi khách đã gửi
 *   một yêu cầu thuê (`CHAT_REQUIRES_BOOKING`). Chỉ hỏi khi cần.
 *
 * Cả hai là chuyện GIAO DIỆN — cổng thật nằm ở `POST /conversations`.
 *
 * ⚠️ Không có lớp "gian hàng của chính mình" (gỡ 25/09/2026). Đợt 24/09 thêm nó CHỈ ở app để chặn
 * người bán tự mở một hội thoại với chính gian hàng mình; web không có, nên cùng một chủ shop thấy
 * hai hành vi trên hai bề mặt. Lỗ hổng gốc nằm ở BACKEND (`ChatService.canCustomerOpenChat` không
 * chặn tự-nhắn-mình) — chỗ sửa đúng là ở đó, cho cả hai app cùng lúc; đã báo trong sổ đồng bộ.
 */
export function useShopChatAvailable(shopSlug: string, publicChatOpen: boolean): boolean {
  const eligibility = useQuery({
    queryKey: queryKeys.chat.eligibility(shopSlug),
    queryFn: () => chatApi.eligibility(shopSlug),
    enabled: !publicChatOpen,
    staleTime: STALE_TIME.STANDARD,
  });

  return publicChatOpen || eligibility.data?.canChat === true;
}
