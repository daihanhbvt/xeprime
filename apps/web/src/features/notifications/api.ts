import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPatch, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { NotificationFilters, NotificationItem } from './types';

export const NOTIFICATIONS_DEFAULT_LIMIT = 15;

export interface NotificationListResult {
  items: NotificationItem[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: NotificationFilters): QueryParams {
  return {
    unreadOnly: filters.unreadOnly ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? NOTIFICATIONS_DEFAULT_LIMIT,
  };
}

export async function fetchNotifications(
  filters: NotificationFilters,
): Promise<NotificationListResult> {
  const res = await apiRequest<NotificationItem[]>('/notifications', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: NOTIFICATIONS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchUnreadCount = (): Promise<{ count: number }> =>
  apiGet<{ count: number }>('/notifications/unread-count');

export const markNotificationRead = (id: string): Promise<{ id: string; readAt: string }> =>
  apiPatch<{ id: string; readAt: string }>(`/notifications/${id}/read`);

export const markAllNotificationsRead = (): Promise<{ updated: number }> =>
  apiPost<{ updated: number }>('/notifications/mark-all-read');
