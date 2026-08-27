import {
  TENANT_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_PUBLIC_STATUS_VALUES,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';

const ALL_OPTION = { value: 'all', label: 'Tất cả' };

/**
 * Option lọc sinh THẲNG từ metadata trạng thái ở `@xeprime/types` — thêm một trạng thái mới
 * là bộ lọc tự có, không phải nhớ sửa hai chỗ (ADR 0005).
 */
export const ADMIN_VEHICLE_PUBLIC_STATUS_OPTIONS = [
  ALL_OPTION,
  ...VEHICLE_PUBLIC_STATUS_VALUES.map((value) => ({
    value,
    label: VEHICLE_PUBLIC_STATUS_META[value].label,
  })),
];

export const ADMIN_VEHICLE_OPERATION_STATUS_OPTIONS = [
  ALL_OPTION,
  ...VEHICLE_OPERATION_STATUS_VALUES.map((value) => ({
    value,
    label: VEHICLE_OPERATION_STATUS_META[value].label,
  })),
];

export const ADMIN_VEHICLE_TYPE_OPTIONS = [
  ALL_OPTION,
  ...VEHICLE_TYPE_VALUES.map((value) => ({ value, label: VEHICLE_TYPE_LABEL[value] })),
];

/** Lối tắt hay dùng nhất của kiểm duyệt: soát xe đang hiển thị của gian hàng đã bị khoá. */
export const ADMIN_VEHICLE_QUICK_FILTERS = [
  {
    key: 'public',
    label: 'Đang hiển thị',
    patch: { publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC, tenantStatus: 'all' },
  },
  {
    key: 'hidden',
    label: 'Đã bị ẩn',
    patch: { publicStatus: VEHICLE_PUBLIC_STATUS.HIDDEN, tenantStatus: 'all' },
  },
  {
    key: 'suspended-shop',
    label: 'Của shop bị khoá',
    patch: { publicStatus: 'all', tenantStatus: TENANT_STATUS.SUSPENDED },
  },
] as const;
