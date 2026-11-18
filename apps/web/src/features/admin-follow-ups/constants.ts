import { FOLLOW_UP_STATUS, STATUS_COLOR, type FollowUpStatus } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';

/**
 * Ba góc nhìn của trang Đơn thuê toàn hệ thống theo hành trình một chuyến — `?view=` trên URL
 * (ADR 0004): chưa giữ chỗ (yêu cầu đang chờ) → đã thành đơn (mặc định, không mang `view`) →
 * không thành (cần chăm sóc).
 */
export const ADMIN_BOOKINGS_VIEW = {
  PENDING: 'pending',
  BOOKINGS: 'bookings',
  FOLLOW_UPS: 'follow-ups',
} as const;
export type AdminBookingsView = (typeof ADMIN_BOOKINGS_VIEW)[keyof typeof ADMIN_BOOKINGS_VIEW];
export const ADMIN_BOOKINGS_VIEW_PARAM = 'view';

/** Link tới tab "Không thành" (cần chăm sóc) — dùng cho ô Tổng quan nền tảng và nút đổi tab. */
export const FOLLOW_UPS_HREF = `${ROUTES.ADMIN.BOOKINGS}?${ADMIN_BOOKINGS_VIEW_PARAM}=${ADMIN_BOOKINGS_VIEW.FOLLOW_UPS}`;

/** Link tới tab "Chưa giữ chỗ" — yêu cầu đang chờ chủ xe duyệt / chờ khách chuyển tiền. */
export const PENDING_REQUESTS_HREF = `${ROUTES.ADMIN.BOOKINGS}?${ADMIN_BOOKINGS_VIEW_PARAM}=${ADMIN_BOOKINGS_VIEW.PENDING}`;

/** Đọc `?view=`; giá trị lạ hoặc thiếu = danh sách đơn (mặc định, link cũ vẫn đúng chỗ). */
export function parseAdminBookingsView(value: string | null): AdminBookingsView {
  return value === ADMIN_BOOKINGS_VIEW.PENDING || value === ADMIN_BOOKINGS_VIEW.FOLLOW_UPS
    ? value
    : ADMIN_BOOKINGS_VIEW.BOOKINGS;
}

/** Link của từng tab — tab mặc định không mang `view`, đổi tab là bỏ bộ lọc của tab kia. */
export const ADMIN_BOOKINGS_VIEW_HREF: Readonly<Record<AdminBookingsView, string>> = {
  [ADMIN_BOOKINGS_VIEW.PENDING]: PENDING_REQUESTS_HREF,
  [ADMIN_BOOKINGS_VIEW.BOOKINGS]: ROUTES.ADMIN.BOOKINGS,
  [ADMIN_BOOKINGS_VIEW.FOLLOW_UPS]: FOLLOW_UPS_HREF,
};

/** Màu nhãn trạng thái chăm sóc — nhãn dịch ở `AdminFollowUps.status`. */
export const FOLLOW_UP_STATUS_COLOR: Readonly<Record<FollowUpStatus, string>> = {
  [FOLLOW_UP_STATUS.NEW]: STATUS_COLOR.WAITING,
  [FOLLOW_UP_STATUS.CONTACTED]: STATUS_COLOR.PROCESSING,
  [FOLLOW_UP_STATUS.REBOOKED]: STATUS_COLOR.SUCCESS,
  [FOLLOW_UP_STATUS.NOT_INTERESTED]: STATUS_COLOR.NEUTRAL,
};
