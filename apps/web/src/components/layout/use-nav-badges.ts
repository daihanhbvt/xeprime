'use client';

import { PERMISSION } from '@xeprime/types';
import { NAV_BADGE, type NavBadgeKey } from '@/constants/nav';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { usePendingBookingRequestCount } from '@/features/booking-requests/hooks/use-pending-booking-request-count';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';

export type NavBadgeCounts = Readonly<Record<NavBadgeKey, number>>;

/**
 * Con số trên các mục menu — CHỈ những thứ đang chờ người dùng xử lý.
 *
 * Hai nguồn, hai lý do:
 *  - yêu cầu đặt xe chờ duyệt: khách đang đợi câu trả lời, để lâu là mất đơn;
 *  - tin nhắn chưa đọc: cùng bản chất, và dùng lại đúng query mà chuông ở thanh trên đã gọi
 *    (`useChatUnreadCount`) nên không phát sinh thêm request nào.
 *
 * Không có huy hiệu cho "số xe", "số khách", "số chi nhánh": đó là thống kê, và thống kê nhét
 * lên sidebar thì mọi mục đều sáng, không mục nào còn báo được điều gì.
 *
 * Nhân sự nền tảng không có hai khái niệm này — query tắt hẳn thay vì gọi rồi nuốt 403.
 */
export function useNavBadges(): NavBadgeCounts {
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();

  const isShopScope = Boolean(user) && !user?.platformRole;
  const { data: chatUnread } = useChatUnreadCount(isShopScope && has(PERMISSION.TENANT_VIEW));
  const { data: pendingRequests } = usePendingBookingRequestCount(
    isShopScope && has(PERMISSION.BOOKING_REQUEST_VIEW),
  );

  return {
    [NAV_BADGE.BOOKING_REQUESTS_PENDING]: pendingRequests ?? 0,
    [NAV_BADGE.CHAT_UNREAD]: chatUnread?.count ?? 0,
  };
}
