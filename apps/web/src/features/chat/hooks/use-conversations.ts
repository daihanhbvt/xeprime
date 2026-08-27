'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchConversations } from '../api';
import { useChatRealtime } from '../context/ChatRealtimeContext';

/** Danh sách hội thoại của tôi. Poll để cập nhật last message + unread (nhẹ hơn khi có realtime). */
export function useConversations() {
  const { ready } = useChatRealtime();
  return useQuery({
    queryKey: queryKeys.chat.conversations(),
    queryFn: () => fetchConversations(1),
    refetchInterval: ready ? 30_000 : 8_000,
    refetchOnWindowFocus: true,
  });
}
