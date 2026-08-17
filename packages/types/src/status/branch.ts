import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái chi nhánh gian hàng — ADR 0005 (không bao giờ dùng string literal trần).
 *
 * Chỉ hai trạng thái, và KHÔNG có `deleted`: ngừng hoạt động là `inactive` + `deleted_at` cho
 * xoá mềm. Chi nhánh còn xe hoặc còn đơn thì không xoá được — vị trí của một chuyến đã đi phải
 * còn tra lại được.
 */
export const BRANCH_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type BranchStatus = (typeof BRANCH_STATUS)[keyof typeof BRANCH_STATUS];

export const BRANCH_STATUS_VALUES = Object.values(BRANCH_STATUS) as BranchStatus[];

export const BRANCH_STATUS_LABEL: Readonly<Record<BranchStatus, string>> = {
  [BRANCH_STATUS.ACTIVE]: 'Đang hoạt động',
  [BRANCH_STATUS.INACTIVE]: 'Ngừng hoạt động',
};

/** Nhãn + màu cho `StatusTag` dùng chung (xanh = đang chạy, xám = đã dừng). */
export const BRANCH_STATUS_META: Readonly<Record<BranchStatus, StatusMeta>> = {
  [BRANCH_STATUS.ACTIVE]: {
    label: BRANCH_STATUS_LABEL[BRANCH_STATUS.ACTIVE],
    color: STATUS_COLOR.SUCCESS,
  },
  [BRANCH_STATUS.INACTIVE]: {
    label: BRANCH_STATUS_LABEL[BRANCH_STATUS.INACTIVE],
    color: STATUS_COLOR.NEUTRAL,
  },
};

export function isBranchStatus(value: unknown): value is BranchStatus {
  return typeof value === 'string' && (BRANCH_STATUS_VALUES as string[]).includes(value);
}
