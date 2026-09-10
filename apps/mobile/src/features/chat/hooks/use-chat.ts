import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { chatApi, type ConversationListResult } from '@/api/chat/api';
import { CHAT_SIDE } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';

/**
 * Server data của Tin nhắn — TanStack Query, key và endpoint dùng chung với web
 * (`@xeprime/api-client`). Không có "API mobile" riêng cho chat: chỉ phần AUTH khác envelope
 * (ADR 0017), còn mọi API nghiệp vụ là một.
 *
 * App native của khách CHỈ có hộp thư phía khách. Inbox gian hàng là một bề mặt khác, sống ở khu
 * quản lý; hằng `CHAT_SIDE.CUSTOMER` cắm cứng ở đây là để không có màn nào của khách vô tình xin
 * danh sách trộn hai vai.
 */
const SIDE = CHAT_SIDE.CUSTOMER;

export interface ConversationFilters {
  q?: string;
  unreadOnly?: boolean;
}

/** Danh sách hội thoại, tải thêm khi cuộn (mobile không có bộ số trang). */
export function useConversationsInfinite(filters: ConversationFilters = {}) {
  const params = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.unreadOnly ? { unreadOnly: true } : {}),
  };

  return useInfiniteQuery({
    // KHÔNG có `page` trong khoá — page là `pageParam` của TanStack (quy ước `*Infinite`).
    queryKey: queryKeys.chat.conversations(SIDE, params),
    queryFn: ({ pageParam }) => chatApi.list({ side: SIDE, ...filters }, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last: ConversationListResult) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    // Giữ danh sách cũ khi đổi bộ lọc — nếu không, mỗi ký tự gõ vào ô tìm là một lần màn trắng.
    placeholderData: keepPreviousData,
  });
}

/**
 * Một hội thoại theo id — đường vào của DEEP LINK và của thông báo đẩy.
 *
 * Màn thread nhận id qua route param chứ không nhận cả object hội thoại: `xeprime://chat/<id>`
 * mở thẳng từ ngoài app, và ở đó không có danh sách nào để lấy tiêu đề ra.
 */
export function useConversation(id: string) {
  return useQuery({
    queryKey: queryKeys.chat.conversation(SIDE, id),
    queryFn: () => chatApi.detail(id, SIDE),
    enabled: Boolean(id),
  });
}

export function useChatUnreadCount(enabled = true) {
  return useQuery({
    queryKey: queryKeys.chat.unreadCount(SIDE),
    queryFn: () => chatApi.unreadCount(SIDE),
    enabled,
  });
}
