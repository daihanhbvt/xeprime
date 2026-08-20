import type { ReactNode } from 'react';
import {
  BellOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RollbackOutlined,
  ShopOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { NOTIFICATION_TARGET_TYPE, NOTIFICATION_TYPE, type NotificationType } from '@xeprime/types';
import { ROUTES, tripPath } from '@/constants/routes';

/** Ngữ cảnh xem thông báo — quyết định link click-through (khu quản lý vs khu khách). */
export type NotificationContext = 'manage' | 'customer';

const ICONS: Readonly<Record<NotificationType, ReactNode>> = {
  [NOTIFICATION_TYPE.BOOKING_CREATED]: <CalendarOutlined />,
  [NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED]: <CarOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED]: <CarOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED]: <CheckCircleOutlined />,
  [NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED]: <CloseCircleOutlined />,
  // Khách RÚT lại yêu cầu — khác chiều với shop từ chối, nên khác icon.
  [NOTIFICATION_TYPE.BOOKING_REQUEST_CANCELLED]: <RollbackOutlined />,
  [NOTIFICATION_TYPE.SHOP_APPROVED]: <ShopOutlined />,
  [NOTIFICATION_TYPE.SHOP_REJECTED]: <ShopOutlined />,
  [NOTIFICATION_TYPE.VEHICLE_APPROVED]: <CarOutlined />,
  [NOTIFICATION_TYPE.VEHICLE_REJECTED]: <CarOutlined />,
  [NOTIFICATION_TYPE.REVIEW_RECEIVED]: <StarOutlined />,
};

export function notificationIcon(type: string): ReactNode {
  return ICONS[type as NotificationType] ?? <BellOutlined />;
}

/**
 * Link click-through theo `targetType`. Người xem ở khu /manage đi tới màn shop tương ứng;
 * khách đi thẳng tới ĐÚNG chuyến. Trả null khi không có đích hợp lý (chỉ đánh dấu đã đọc).
 *
 * Phía khách, `booking` và `booking_request` đều phân giải về `/trips/:id`: backend nhận cả hai
 * loại id cho cùng một chuyến (Wave 11), nên thông báo cũ phát trước khi có đơn vẫn tới đúng
 * nơi. `review` thì không — `targetId` của nó là id đánh giá, không phải id chuyến, nên link
 * dừng ở danh sách thay vì dẫn tới một trang 404.
 */
export function notificationHref(
  notification: { targetType?: string | null; targetId?: string | null },
  context: NotificationContext,
): string | null {
  const target = notification.targetType;
  if (context === 'customer') {
    switch (target) {
      case NOTIFICATION_TARGET_TYPE.BOOKING:
      case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
        return notification.targetId ? tripPath.detail(notification.targetId) : ROUTES.TRIPS;
      case NOTIFICATION_TARGET_TYPE.REVIEW:
        return ROUTES.TRIPS;
      default:
        return null;
    }
  }
  switch (target) {
    case NOTIFICATION_TARGET_TYPE.BOOKING:
      return ROUTES.MANAGE.BOOKINGS;
    case NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST:
      return ROUTES.MANAGE.BOOKING_REQUESTS;
    case NOTIFICATION_TARGET_TYPE.TENANT:
      return ROUTES.MANAGE.SHOP;
    case NOTIFICATION_TARGET_TYPE.VEHICLE:
      return ROUTES.MANAGE.VEHICLES;
    default:
      return null;
  }
}
