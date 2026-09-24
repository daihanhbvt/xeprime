import {
  APPROVAL_STATUS,
  APPROVAL_STATUS_VALUES,
  STOREFRONT_KIND_VALUES,
  VEHICLE_TYPE_VALUES,
  type ApprovalStatus,
} from '@xeprime/types';

/**
 * "Mọi trạng thái" ở URL — KHÔNG phải `'all'`.
 *
 * Hàng đợi mặc định là `pending` (URL không có `status`). `useUrlFilters` xoá mọi giá trị `'all'`
 * khỏi URL, nên nếu "tất cả trạng thái" cũng là `'all'` thì chọn nó sẽ làm URL rỗng, và URL rỗng
 * lại đọc về `pending` — bộ chọn nhảy ngược ngay khi vừa chọn. Một mã riêng thì sống sót qua F5,
 * nút Back và link gửi cho nhau.
 */
export const APPROVAL_STATUS_ANY = 'any';

/** Thứ tự trạng thái trong bộ lọc — việc CẦN LÀM đứng đầu. */
export const APPROVAL_STATUS_FILTER_ORDER: readonly ApprovalStatus[] = [
  APPROVAL_STATUS.PENDING,
  ...APPROVAL_STATUS_VALUES.filter((status) => status !== APPROVAL_STATUS.PENDING),
];

export const VEHICLE_TYPE_TABS = VEHICLE_TYPE_VALUES;
export const STOREFRONT_KIND_FILTER_VALUES = STOREFRONT_KIND_VALUES;
