import { STATUS_COLOR, type StatusColor } from './status/meta';

/**
 * Loại thông báo in-app (Phase 5). Không phải "status" — đây là loại sự kiện phát ra
 * thông báo, nên đứng riêng khỏi `status/`. Backend sinh `title`/`body` đã địa phương hoá
 * lúc emit; FE dùng `type` để chọn icon và dựng link tới `targetType`/`targetId`.
 */
export const NOTIFICATION_TYPE = {
  BOOKING_CREATED: 'booking_created',
  BOOKING_STATUS_CHANGED: 'booking_status_changed',
  BOOKING_REQUEST_SUBMITTED: 'booking_request_submitted',
  BOOKING_REQUEST_APPROVED: 'booking_request_approved',
  BOOKING_REQUEST_REJECTED: 'booking_request_rejected',
  SHOP_APPROVED: 'shop_approved',
  SHOP_REJECTED: 'shop_rejected',
  VEHICLE_APPROVED: 'vehicle_approved',
  VEHICLE_REJECTED: 'vehicle_rejected',
  REVIEW_RECEIVED: 'review_received',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPE) as NotificationType[];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPE_VALUES as string[]).includes(value);
}

/** Kênh gửi. MVP chỉ in-app; `push`/`email` mở sau (giữ union để không hard-code string). */
export const NOTIFICATION_CHANNEL = {
  IN_APP: 'in_app',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export const NOTIFICATION_CHANNEL_VALUES = Object.values(
  NOTIFICATION_CHANNEL,
) as NotificationChannel[];

/** Loại đối tượng thông báo trỏ tới — FE switch trên đây để dựng route click-through. */
export const NOTIFICATION_TARGET_TYPE = {
  BOOKING: 'booking',
  BOOKING_REQUEST: 'booking_request',
  REVIEW: 'review',
  TENANT: 'tenant',
  VEHICLE: 'vehicle',
} as const;

export type NotificationTargetType =
  (typeof NOTIFICATION_TARGET_TYPE)[keyof typeof NOTIFICATION_TARGET_TYPE];

export const NOTIFICATION_TARGET_TYPE_VALUES = Object.values(
  NOTIFICATION_TARGET_TYPE,
) as NotificationTargetType[];

export interface NotificationTypeMeta {
  /** Nhãn nhóm tiếng Việt (dùng cho tiêu đề mặc định / gom nhóm). */
  readonly label: string;
  /** Ant Design preset color cho chấm/tag của thông báo. */
  readonly color: StatusColor;
}

export const NOTIFICATION_TYPE_META: Readonly<Record<NotificationType, NotificationTypeMeta>> = {
  [NOTIFICATION_TYPE.BOOKING_CREATED]: { label: 'Đơn thuê mới', color: STATUS_COLOR.INFO },
  [NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED]: {
    label: 'Cập nhật đơn thuê',
    color: STATUS_COLOR.PROCESSING,
  },
  [NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED]: {
    label: 'Yêu cầu thuê mới',
    color: STATUS_COLOR.WAITING,
  },
  [NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED]: {
    label: 'Yêu cầu được duyệt',
    color: STATUS_COLOR.SUCCESS,
  },
  [NOTIFICATION_TYPE.BOOKING_REQUEST_REJECTED]: {
    label: 'Yêu cầu bị từ chối',
    color: STATUS_COLOR.DANGER,
  },
  [NOTIFICATION_TYPE.SHOP_APPROVED]: { label: 'Gian hàng được duyệt', color: STATUS_COLOR.SUCCESS },
  [NOTIFICATION_TYPE.SHOP_REJECTED]: { label: 'Gian hàng bị từ chối', color: STATUS_COLOR.DANGER },
  [NOTIFICATION_TYPE.VEHICLE_APPROVED]: {
    label: 'Xe được duyệt công khai',
    color: STATUS_COLOR.SUCCESS,
  },
  [NOTIFICATION_TYPE.VEHICLE_REJECTED]: { label: 'Xe bị từ chối', color: STATUS_COLOR.DANGER },
  [NOTIFICATION_TYPE.REVIEW_RECEIVED]: { label: 'Đánh giá mới', color: STATUS_COLOR.SPECIAL },
};
