import {
  BOOKING_DATE_FIELD_LABEL,
  BOOKING_DATE_FIELD_VALUES,
  BOOKING_STATUS_META,
  BOOKING_STATUS_VALUES,
} from '@xeprime/types';

/** Option lọc trạng thái đơn sinh từ metadata ở `@xeprime/types` (ADR 0005). */
export const ADMIN_BOOKING_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...BOOKING_STATUS_VALUES.map((value) => ({ value, label: BOOKING_STATUS_META[value].label })),
];

/**
 * Khoảng ngày áp lên trường nào. Giá trị lấy từ `@xeprime/types` — nó đi trong query string nên
 * web và api phải dùng CHUNG một nguồn, không khai lại hai bên rồi trông chờ khớp nhau.
 */
export const ADMIN_BOOKING_DATE_FIELD_OPTIONS = BOOKING_DATE_FIELD_VALUES.map((value) => ({
  value,
  label: BOOKING_DATE_FIELD_LABEL[value],
}));
