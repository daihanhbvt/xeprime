import { FOLLOW_UP_STATUS, STATUS_COLOR, type FollowUpStatus } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';

/** Hai góc nhìn của trang Đơn thuê toàn hệ thống — `?view=` trên URL (ADR 0004). */
export const ADMIN_BOOKINGS_VIEW = { BOOKINGS: 'bookings', FOLLOW_UPS: 'follow-ups' } as const;
export type AdminBookingsView = (typeof ADMIN_BOOKINGS_VIEW)[keyof typeof ADMIN_BOOKINGS_VIEW];
export const ADMIN_BOOKINGS_VIEW_PARAM = 'view';

/** Link tới tab "Cần chăm sóc" — dùng cho ô Tổng quan nền tảng và nút đổi tab. */
export const FOLLOW_UPS_HREF = `${ROUTES.ADMIN.BOOKINGS}?${ADMIN_BOOKINGS_VIEW_PARAM}=${ADMIN_BOOKINGS_VIEW.FOLLOW_UPS}`;

/** Màu nhãn trạng thái chăm sóc — nhãn dịch ở `AdminFollowUps.status`. */
export const FOLLOW_UP_STATUS_COLOR: Readonly<Record<FollowUpStatus, string>> = {
  [FOLLOW_UP_STATUS.NEW]: STATUS_COLOR.WAITING,
  [FOLLOW_UP_STATUS.CONTACTED]: STATUS_COLOR.PROCESSING,
  [FOLLOW_UP_STATUS.REBOOKED]: STATUS_COLOR.SUCCESS,
  [FOLLOW_UP_STATUS.NOT_INTERESTED]: STATUS_COLOR.NEUTRAL,
};
