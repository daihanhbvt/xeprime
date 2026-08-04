import { USER_STATUS_META, USER_STATUS_VALUES } from '@xeprime/types';

/** Option lọc trạng thái tài khoản khách, sinh từ metadata ở `@xeprime/types` (ADR 0005). */
export const ADMIN_CUSTOMER_STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...USER_STATUS_VALUES.map((value) => ({ value, label: USER_STATUS_META[value].label })),
];
