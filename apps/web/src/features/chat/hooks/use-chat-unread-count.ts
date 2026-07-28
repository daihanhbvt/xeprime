'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchChatUnreadCount } from '../api';
import { useChatRealtime } from '../context/ChatRealtimeContext';

/**
 * Tổng tin chưa đọc cho badge icon chat. Poll nhẹ (nhanh hơn khi chưa có realtime).
 * `enabled=false` (vd khu công khai khi chưa đăng nhập) để không gọi API gây 401.
 */
export function useChatUnreadCount(enabled = true) {
  const { ready } = useChatRealtime();
  return useQuery({
    queryKey: queryKeys.chat.unreadCount(),
    queryFn: fetchChatUnreadCount,
    enabled,
    refetchInterval: ready ? 30_000 : 8_000,
    refetchOnWindowFocus: true,
  });
}
