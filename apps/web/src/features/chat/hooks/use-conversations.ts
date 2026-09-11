'use client';

import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { chatApi } from '../api';
import type { ConversationListResult } from '../types';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';

/**
 * Nhịp làm mới danh sách — chỉ còn là LƯỚI AN TOÀN.
 *
 * Đường chính là bản chiếu huy hiệu: nó bao trùm MỌI hội thoại của người này, nên nó là tín hiệu
 * đúng cho một danh sách. Listener của thread thì không — nó chỉ nghe đúng hội thoại đang mở, và
 * đó là lý do trước đây một tin đến ở hội thoại KHÁC chỉ làm đổi con số trên biểu tượng chat còn
 * dòng trong danh sách đứng im tới nhịp poll kế tiếp.
 */
const LIST_POLL_LIVE_MS = 60_000;
const LIST_POLL_FALLBACK_MS = 10_000;

export interface ConversationListFilters {
  q?: string;
  unreadOnly?: boolean;
}

/**
 * Hộp thư của MỘT bề mặt, tải dần theo cuộn.
 *
 * `side` nằm trong queryKey chứ không chỉ trong query string: `/chat` và `/manage/chat` là hai
 * tập dữ liệu, và một khoá chung nghĩa là mở khu quản lý sẽ ghi đè cache của khu khách — quay
 * lại thấy inbox công việc nằm trong hộp thư cá nhân cho tới khi request mới về.
 *
 * `page` KHÔNG có trong khoá: nó là `pageParam` của TanStack (quy ước của các nhánh `*Infinite`
 * ở `queryKeys`). Có `page` trong khoá thì mỗi trang là một cache riêng và danh sách không bao
 * giờ nối lại được.
 */
export function useConversationsInfinite(side: ChatSide, filters: ConversationListFilters = {}) {
  const { counts, live } = useBadgeRealtime();
  const queryClient = useQueryClient();
  const params = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.unreadOnly ? { unreadOnly: true } : {}),
  };

  /*
   * Con số chưa đọc của CHÍNH bề mặt này đổi ⇒ có gì đó vừa xảy ra ở một hội thoại nào đó ⇒ tải
   * lại danh sách. Đây là cầu nối mà trước đây thiếu: bản chiếu huy hiệu biết mọi hội thoại, còn
   * listener của thread chỉ biết một.
   *
   * Chỉ khi con số ĐỔI, và bỏ qua lần chạy đầu — nếu không mỗi lần mount sẽ tự tạo thêm một
   * request ngay sau lượt tải đầu tiên.
   */
  const unread = side === CHAT_SIDE.CUSTOMER ? counts.chatCustomer : counts.chatShop;
  const lastUnread = useRef<number | null>(null);

  useEffect(() => {
    if (lastUnread.current !== null && lastUnread.current !== unread) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations(side) });
    }
    lastUnread.current = unread;
  }, [unread, side, queryClient]);

  return useInfiniteQuery({
    queryKey: queryKeys.chat.conversations(side, params),
    queryFn: ({ pageParam }) => chatApi.list({ side, ...filters }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: ConversationListResult) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    // Giữ danh sách cũ khi đổi bộ lọc: gõ vào ô tìm kiếm mà danh sách biến mất rồi hiện lại là
    // ba lần đổi bố cục cho một ký tự.
    placeholderData: keepPreviousData,
    refetchInterval: live ? LIST_POLL_LIVE_MS : LIST_POLL_FALLBACK_MS,
    refetchOnWindowFocus: true,
  });
}

/**
 * Một hội thoại theo id — chỉ chạy khi id KHÔNG có trong danh sách đã tải.
 *
 * Đây là thứ làm deep link hoạt động thật: một thread im lặng ba tuần nằm ở trang 4, và suy
 * "hội thoại đang mở" từ trang đầu của danh sách nghĩa là `?c=` trong email mở ra màn trống.
 */
export function useConversationById(side: ChatSide, id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.chat.conversation(side, id ?? ''),
    queryFn: () => chatApi.detail(id as string, side),
    enabled: enabled && Boolean(id),
    retry: false,
  });
}
