// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  notificationsApi,
  notificationFiltersToParams,
  notificationListKeyParams,
  NOTIFICATIONS_DEFAULT_LIMIT,
} from '@/api/notifications/api';

export type {
  NotificationFilters,
  NotificationItem,
  NotificationListResult,
} from '@/api/notifications/api';
