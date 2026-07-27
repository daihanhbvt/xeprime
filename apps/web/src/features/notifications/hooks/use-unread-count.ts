'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchUnreadCount } from '../api';

/** Đếm chưa đọc cho badge chuông — poll nhẹ để cập nhật gần thời gian thực mà không cần realtime. */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
