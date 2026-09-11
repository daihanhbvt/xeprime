'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useOnBadgeChange } from '@/features/badges/hooks/use-on-badge-change';
import { queryKeys } from '@/services/query-keys';
import { fetchNotifications, filtersToParams } from '../api';
import type { NotificationFilters } from '../types';

/**
 * Danh sách thông báo của tôi — server data (TanStack Query). `enabled` để chỉ tải khi mở popover.
 *
 * Hai thứ giữ cho DANH SÁCH không nói khác CON SỐ trên chuông:
 *
 *  1. `staleTime: 0` — bấm vào chuông là một hành động "cho tôi xem NGAY". Với `staleTime` 30 giây
 *     mặc định của toàn app, mở lại popover trong vòng 30 giây sẽ phục vụ bản cache cũ: con số đã
 *     nhảy (bản chiếu realtime cập nhật tức thì) mà danh sách thì chưa. Đúng triệu chứng "chuông
 *     báo có việc mới, mở ra không thấy gì".
 *  2. Tín hiệu từ bản chiếu — để một popover ĐANG MỞ cũng cập nhật, không phải đóng rồi mở lại.
 */
export function useNotifications(filters: NotificationFilters, enabled: boolean) {
  const { counts } = useBadgeRealtime();
  const queryClient = useQueryClient();

  useOnBadgeChange(counts.notificationsUnread, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  });

  return useQuery({
    queryKey: queryKeys.notifications.list(filtersToParams(filters)),
    queryFn: () => fetchNotifications(filters),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}
