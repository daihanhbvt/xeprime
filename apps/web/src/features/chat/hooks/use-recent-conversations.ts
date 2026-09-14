'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useOnBadgeChange } from '@/features/badges/hooks/use-on-badge-change';
import { queryKeys } from '@/services/query-keys';
import { chatApi } from '../api';
import type { ConversationListResult } from '../types';

/** Số dòng của popup xem nhanh — vừa một tầm mắt, không thành một hộp thư thứ hai. */
export const RECENT_CONVERSATIONS_LIMIT = 6;

/**
 * Vài hội thoại mới nhất cho popup xem nhanh ở thanh trên cùng.
 *
 * Ba điều khác với danh sách của trang `/chat`:
 *
 *  1. `enabled` — chỉ gọi khi popup MỞ. Biểu tượng này nằm trên mọi trang của sản phẩm; tải sẵn
 *     hộp thư ở mỗi lần đổi trang là một request cho một thứ hầu hết thời gian không ai xem.
 *  2. `staleTime: 0` — bấm vào biểu tượng là "cho tôi xem NGAY". Với `staleTime` mặc định, mở lại
 *     popup trong ít giây sẽ phục vụ bản cache cũ trong khi con số trên huy hiệu (bản chiếu
 *     realtime) đã nhảy — đúng triệu chứng "báo có tin mới, mở ra không thấy".
 *  3. Khoá riêng (`preview`) — nó KHÔNG dùng chung cache với danh sách phân trang vô hạn của
 *     trang chat, vì hai bên có hình dạng dữ liệu khác nhau (`InfiniteData` vs một trang).
 */
export function useRecentConversations(side: ChatSide, enabled: boolean) {
  const { counts } = useBadgeRealtime();
  const queryClient = useQueryClient();

  const key = queryKeys.chat.conversations(side, { preview: true });

  // Popup ĐANG mở mà có tin mới thì danh sách phải tự đổi, không phải đóng rồi mở lại.
  useOnBadgeChange(side === CHAT_SIDE.CUSTOMER ? counts.chatCustomer : counts.chatShop, () => {
    void queryClient.invalidateQueries({ queryKey: key });
  });

  return useQuery<ConversationListResult>({
    queryKey: key,
    queryFn: () => chatApi.list({ side }, 1),
    enabled,
    staleTime: 0,
  });
}
