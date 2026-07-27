import type { components } from '@xeprime/types';

/** Shape thông báo lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type NotificationItem = Schemas['NotificationDto'];

/** Filter danh sách thông báo (client-side, không đẩy URL vì đây là popover). */
export interface NotificationFilters {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}
