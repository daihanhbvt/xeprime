import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { chatApi } from '@/features/chat/api';
import { queryKeys } from '@/queries/query-keys';

/**
 * "Khách này có nhắn được cho gian hàng không" — câu trả lời DUY NHẤT cho cả nút lẫn chỗ đặt nút.
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
 * Đây là chuyện GIAO DIỆN, không phải kiểm soát quyền: cổng thật nằm ở `POST /conversations`.
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
