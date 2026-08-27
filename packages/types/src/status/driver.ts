import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Tài xế của gian hàng (bảng `drivers` — plan 17/08, spec §drivers trong
 * `xeprime_database_design.md`). Đợt đầu chỉ hồ sơ + gán vào đơn; giấy tờ/lịch bận làm sau.
 */
export const DRIVER_TYPE = {
  STAFF: 'staff',
  COLLABORATOR: 'collaborator',
  TEMPORARY: 'temporary',
} as const;

export type DriverType = (typeof DRIVER_TYPE)[keyof typeof DRIVER_TYPE];
export const DRIVER_TYPE_VALUES = Object.values(DRIVER_TYPE) as DriverType[];

export const DRIVER_TYPE_LABEL: Readonly<Record<DriverType, string>> = {
  [DRIVER_TYPE.STAFF]: 'Nhân viên',
  [DRIVER_TYPE.COLLABORATOR]: 'Cộng tác viên',
  [DRIVER_TYPE.TEMPORARY]: 'Thời vụ',
};

/** Trạng thái hồ sơ tài xế — `inactive` vẫn giữ lịch sử đơn cũ, chỉ không gán vào đơn mới. */
export const DRIVER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];
export const DRIVER_STATUS_VALUES = Object.values(DRIVER_STATUS) as DriverStatus[];

export const DRIVER_STATUS_META: Readonly<Record<DriverStatus, StatusMeta>> = {
  [DRIVER_STATUS.ACTIVE]: { label: 'Đang hoạt động', color: STATUS_COLOR.SUCCESS },
  [DRIVER_STATUS.INACTIVE]: { label: 'Ngừng hoạt động', color: STATUS_COLOR.NEUTRAL },
};

export function isDriverStatus(value: unknown): value is DriverStatus {
  return typeof value === 'string' && (DRIVER_STATUS_VALUES as string[]).includes(value);
}
