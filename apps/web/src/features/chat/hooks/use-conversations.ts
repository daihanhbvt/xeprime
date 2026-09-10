'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { chatApi } from '../api';
import type { ConversationListResult } from '../types';
import type { ChatSide } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { useChatRealtime } from '../context/ChatRealtimeContext';

/** Nhịp làm mới danh sách. Có realtime thì thưa hẳn — snapshot đã kéo về khi có tin. */
const LIST_POLL_READY_MS = 30_000;
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
  const { ready } = useChatRealtime();
  const params = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.unreadOnly ? { unreadOnly: true } : {}),
  };

  return useInfiniteQuery({
    queryKey: queryKeys.chat.conversations(side, params),
    queryFn: ({ pageParam }) => chatApi.list({ side, ...filters }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: ConversationListResult) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    // Giữ danh sách cũ khi đổi bộ lọc: gõ vào ô tìm kiếm mà danh sách biến mất rồi hiện lại là
    // ba lần đổi bố cục cho một ký tự.
    placeholderData: keepPreviousData,
    refetchInterval: ready ? LIST_POLL_READY_MS : LIST_POLL_FALLBACK_MS,
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
