import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái yêu cầu đặt xe từ Marketplace (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §11.1. `xeprime_overall_user_flow_next_node.md` §15 ghi
 * `approved` / `customer_cancelled` — bản đó BỊ GHI ĐÈ.
 */
export const BOOKING_REQUEST_STATUS = {
  PENDING_HOST_APPROVAL: 'pending_host_approval',
  APPROVED_BY_HOST: 'approved_by_host',
  REJECTED_BY_HOST: 'rejected_by_host',
  CANCELLED_BY_CUSTOMER: 'cancelled_by_customer',
  EXPIRED: 'expired',
  CONVERTED_TO_BOOKING: 'converted_to_booking',
} as const;

export type BookingRequestStatus =
  (typeof BOOKING_REQUEST_STATUS)[keyof typeof BOOKING_REQUEST_STATUS];

export const BOOKING_REQUEST_STATUS_VALUES = Object.values(
  BOOKING_REQUEST_STATUS,
) as BookingRequestStatus[];

export function isBookingRequestStatus(value: unknown): value is BookingRequestStatus {
  return typeof value === 'string' && (BOOKING_REQUEST_STATUS_VALUES as string[]).includes(value);
}

/**
 * Trạng thái CHIẾM CHỖ trên lịch xe (ADR 0006).
 *
 * `pending_host_approval` cố ý KHÔNG chiếm lịch: nhiều khách được phép cùng hỏi một xe
 * cùng khung giờ, ai được duyệt trước thì được xe. Chỉ khi shop duyệt mới giữ chỗ.
 */
export const BOOKING_REQUEST_STATUS_OCCUPYING: readonly BookingRequestStatus[] = [
  BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
];

export const BOOKING_REQUEST_STATUS_META: Readonly<Record<BookingRequestStatus, StatusMeta>> = {
  [BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL]: {
    label: 'Chờ chủ shop duyệt',
    color: STATUS_COLOR.WAITING,
  },
  [BOOKING_REQUEST_STATUS.APPROVED_BY_HOST]: {
    label: 'Chủ shop đã duyệt',
    color: STATUS_COLOR.SUCCESS,
  },
  [BOOKING_REQUEST_STATUS.REJECTED_BY_HOST]: {
    label: 'Chủ shop từ chối',
    color: STATUS_COLOR.DANGER,
  },
  [BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER]: {
    label: 'Khách đã hủy',
    color: STATUS_COLOR.NEUTRAL,
  },
  [BOOKING_REQUEST_STATUS.EXPIRED]: {
    label: 'Quá hạn phản hồi',
    color: STATUS_COLOR.NEUTRAL,
  },
  [BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING]: {
    label: 'Đã tạo đơn thuê',
    color: STATUS_COLOR.SUCCESS,
  },
};
