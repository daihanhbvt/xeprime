import {
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type { NotificationFilters, NotificationItem } from './types';

/**
 * Cố ý ngắn hơn `DEFAULT_PAGE_SIZE`: danh sách này nằm trong dropdown của chuông thông báo,
 * không phải một trang danh sách — 20 dòng là dài hơn chiều cao dropdown.
 */
export const NOTIFICATIONS_DEFAULT_LIMIT = 15;

export type NotificationListResult = Paged<NotificationItem>;

export function filtersToParams(filters: NotificationFilters): QueryParams {
  return {
    unreadOnly: filters.unreadOnly ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? NOTIFICATIONS_DEFAULT_LIMIT,
  };
}

export const fetchNotifications = (
  filters: NotificationFilters,
): Promise<NotificationListResult> =>
  fetchPage<NotificationItem>(
    '/notifications',
    filtersToParams(filters),
    NOTIFICATIONS_DEFAULT_LIMIT,
  );

export const fetchUnreadCount = (): Promise<{ count: number }> =>
  apiGet<{ count: number }>('/notifications/unread-count');

export const markNotificationRead = (id: string): Promise<{ id: string; readAt: string }> =>
  apiPatch<{ id: string; readAt: string }>(`/notifications/${id}/read`);

export const markAllNotificationsRead = (): Promise<{ updated: number }> =>
  apiPost<{ updated: number }>('/notifications/mark-all-read');
