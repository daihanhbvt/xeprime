import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
type Schemas = components['schemas'];

export type NotificationItem = Schemas['NotificationDto'];
export type NotificationListResult = Paged<NotificationItem>;
export type NotificationUnreadCount = Schemas['NotificationUnreadCountDto'];
export type NotificationReadResult = Schemas['NotificationReadResultDto'];
export type NotificationMarkAllResult = Schemas['NotificationMarkAllResultDto'];

/**
 * Cùng con số web dùng cho danh sách trong chuông (`NOTIFICATIONS_DEFAULT_LIMIT`), cố ý ngắn hơn
 * trang mặc định: đây là một tấm trượt, không phải một trang danh sách.
 */
export const NOTIFICATIONS_DEFAULT_LIMIT = 15;

/**
 * Bộ lọc danh sách thông báo — trạng thái của MÀN HÌNH, không có trong contract.
 *
 * Web đặt nó ở state của popover (không lên URL vì popover không chia sẻ được); app giữ ở state
 * của tấm trượt. Cả hai serialize qua ĐÚNG một hàm để query key hai client không lệch nhau.
 */
export interface NotificationFilters {
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Phần bộ lọc đi vào KHOÁ CACHE — cố ý KHÔNG có `page`.
 *
 * `page` là `pageParam` của TanStack (quy ước `*Infinite`): để nó trong khoá thì mỗi trang là
 * một cache riêng và danh sách không bao giờ nối lại được. Tách thành hàm riêng thay vì để nơi
 * gọi tự gõ một object — hai chỗ tự dựng khoá là hai chỗ có thể lệch nhau.
 */
export function notificationListKeyParams(filters: NotificationFilters = {}): QueryParams {
  return {
    unreadOnly: filters.unreadOnly ?? null,
    limit: filters.limit ?? NOTIFICATIONS_DEFAULT_LIMIT,
  };
}

export function notificationFiltersToParams(filters: NotificationFilters): QueryParams {
  return { ...notificationListKeyParams(filters), page: filters.page ?? 1 };
}

/**
 * Thông báo in-app — PER-USER, không tenant-scoped: backend lấy `userId` từ phiên, client không
 * gửi và không thể gửi. Cùng endpoint với web (ADR 0031: mỗi app một bản của tầng gọi này; sửa
 * contract là sửa CẢ HAI).
 */
export const notificationsApi = {
  list(filters: NotificationFilters): Promise<NotificationListResult> {
    return getApiClient().fetchPage<NotificationItem>(
      '/notifications',
      notificationFiltersToParams(filters),
      filters.limit ?? NOTIFICATIONS_DEFAULT_LIMIT,
    );
  },

  unreadCount(): Promise<NotificationUnreadCount> {
    return getApiClient().get<NotificationUnreadCount>('/notifications/unread-count');
  },

  markRead(id: string): Promise<NotificationReadResult> {
    return getApiClient().patch<NotificationReadResult>(
      `/notifications/${encodeURIComponent(id)}/read`,
    );
  },

  markAllRead(): Promise<NotificationMarkAllResult> {
    return getApiClient().post<NotificationMarkAllResult>('/notifications/mark-all-read');
  },
};

/* --- Thiết bị nhận thông báo đẩy (COM-07) --- */

export type RegisterPushDeviceInput = Schemas['RegisterPushDeviceDto'];
export type PushDevice = Schemas['PushDeviceDto'];

/**
 * Thiết bị nhận thông báo đẩy.
 *
 * KHÔNG có `userId`/`sessionId` trong payload, và đó là chủ đích: server lấy cả hai từ phiên
 * (`@CurrentUser`). Một client gửi được `userId` là một client đăng ký được thiết bị đứng tên
 * người khác — rồi nhận mọi thông báo của họ.
 *
 * Cũng KHÔNG có hàm huỷ đăng ký ở đây: đăng xuất native gọi `/auth/mobile/logout`, và server
 * tắt mọi thiết bị của phiên đó trong cùng transaction thu hồi (`NativeSessionService`). Gọi
 * thêm DELETE từ app chỉ là một lời gọi mạng nữa có thể hỏng ở đúng lúc mạng đang chập chờn.
 */
export const pushDeviceApi = {
  register(input: RegisterPushDeviceInput): Promise<PushDevice> {
    return getApiClient().post<PushDevice>('/notifications/device-token', input);
  },
};
