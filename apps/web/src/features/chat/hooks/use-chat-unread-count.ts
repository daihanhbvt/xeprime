'use client';

import { useQuery } from '@tanstack/react-query';
import type { ChatSide } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { chatApi } from '../api';
import { useChatRealtime } from '../context/ChatRealtimeContext';

/**
 * Tổng tin chưa đọc cho badge icon chat — THEO BỀ MẶT.
 *
 * `side` bắt buộc vì con số này dẫn tới một màn cụ thể: badge trên thanh khu khách phải đếm hộp
 * thư khách, badge sidebar khu quản lý phải đếm inbox gian hàng. Cộng gộp cả hai là bảo chủ shop
 * rằng có 3 tin chưa đọc, họ mở inbox công việc ra và không thấy tin nào.
 *
 * `enabled=false` (vd khu công khai khi chưa đăng nhập) để không gọi API gây 401.
 */
export function useChatUnreadCount(side: ChatSide, enabled = true) {
  const { ready } = useChatRealtime();
  return useQuery({
    queryKey: queryKeys.chat.unreadCount(side),
    queryFn: () => chatApi.unreadCount(side),
    enabled,
    refetchInterval: ready ? 30_000 : 8_000,
    refetchOnWindowFocus: true,
  });
}
