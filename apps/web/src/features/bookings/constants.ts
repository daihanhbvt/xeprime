import {
  BOOKING_STATUS,
  SERVICE_TYPE_LABEL,
  SERVICE_TYPE_VALUES,
  type BookingStatus,
  type ServiceType,
} from '@xeprime/types';

/*
 * CỐ Ý KHÔNG còn hai mảng option của ô lọc ở đây (22/09/2026).
 *
 * Cả hai từng dựng nhãn bằng chuỗi tiếng Việt cứng (`BOOKING_STATUS_META[...].label` và một
 * mảng viết tay), nên bộ lọc đơn thuê vẫn nói tiếng Việt trong bản tiếng Anh. Option nay dựng
 * ngay trong `BookingsListView` bằng `useDomainLabel('bookingStatus', …)` và
 * `t('list.sort.*')` — nhãn đi theo ngôn ngữ người xem, mã đi trên dây giữ nguyên (ADR 0012).
 */

export const SERVICE_TYPE_OPTIONS = SERVICE_TYPE_VALUES.map((value) => ({
  value,
  label: SERVICE_TYPE_LABEL[value],
}));

export function serviceTypeLabel(value: string): string {
  return SERVICE_TYPE_LABEL[value as ServiceType] ?? value;
}

/** Nhãn HÀNH ĐỘNG chuyển sang một trạng thái (động từ), khác nhãn trạng thái tĩnh ở META. */
export const BOOKING_TRANSITION_LABEL: Readonly<Record<BookingStatus, string>> = {
  [BOOKING_STATUS.RESERVED]: 'Đặt trước',
  [BOOKING_STATUS.CONFIRMED]: 'Xác nhận',
  [BOOKING_STATUS.ACTIVE]: 'Nhận xe',
  [BOOKING_STATUS.COMPLETED]: 'Hoàn thành',
  [BOOKING_STATUS.CANCELLED]: 'Huỷ đơn',
  [BOOKING_STATUS.NO_SHOW]: 'Khách không đến',
};

/** Chuyển tới các trạng thái này là hành động "phá" → nút danger + xác nhận. */
export const DESTRUCTIVE_TRANSITIONS: readonly BookingStatus[] = [
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
];
