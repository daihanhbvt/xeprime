import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  BOOKING_STATUS_VALUES,
  SERVICE_TYPE_LABEL,
  SERVICE_TYPE_VALUES,
  type BookingStatus,
  type ServiceType,
} from '@xeprime/types';

/** Option cho Select lọc trạng thái — nhãn lấy từ META (CLAUDE.md mục 5, không hardcode). */
export const BOOKING_STATUS_OPTIONS = BOOKING_STATUS_VALUES.map((value) => ({
  value,
  label: BOOKING_STATUS_META[value].label,
}));

export const BOOKING_SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'pickup_asc', label: 'Nhận xe sớm nhất' },
  { value: 'pickup_desc', label: 'Nhận xe muộn nhất' },
  { value: 'return_asc', label: 'Trả xe sớm nhất' },
] as const;

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
