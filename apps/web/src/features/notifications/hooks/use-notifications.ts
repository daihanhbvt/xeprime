'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchNotifications, filtersToParams } from '../api';
import type { NotificationFilters } from '../types';

/** Danh sách thông báo của tôi — server data (TanStack Query). `enabled` để chỉ tải khi mở popover. */
export function useNotifications(filters: NotificationFilters, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.list(filtersToParams(filters)),
    queryFn: () => fetchNotifications(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}
