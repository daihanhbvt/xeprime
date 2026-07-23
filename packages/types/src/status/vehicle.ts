import type { StatusMeta } from './meta';

/**
 * Trạng thái duyệt public của xe (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §9.1. `xeprime_overall_user_flow_next_node.md` §9 ghi
 * `published` / `pending_review` — bản đó BỊ GHI ĐÈ.
 *
 * CLAUDE.md mục 5: client KHÔNG được tự set `approved_public`. Chỉ `ApprovalService` đổi
 * được sang giá trị này, sau khi platform reviewer duyệt.
 */
export const VEHICLE_PUBLIC_STATUS = {
  DRAFT: 'draft',
  PENDING_PUBLIC_REVIEW: 'pending_public_review',
  APPROVED_PUBLIC: 'approved_public',
  NEEDS_REVISION: 'needs_revision',
  REJECTED: 'rejected',
  HIDDEN: 'hidden',
  ARCHIVED: 'archived',
} as const;

export type VehiclePublicStatus =
  (typeof VEHICLE_PUBLIC_STATUS)[keyof typeof VEHICLE_PUBLIC_STATUS];

export const VEHICLE_PUBLIC_STATUS_VALUES = Object.values(
  VEHICLE_PUBLIC_STATUS,
) as VehiclePublicStatus[];

export function isVehiclePublicStatus(value: unknown): value is VehiclePublicStatus {
  return typeof value === 'string' && (VEHICLE_PUBLIC_STATUS_VALUES as string[]).includes(value);
}

export const VEHICLE_PUBLIC_STATUS_META: Readonly<Record<VehiclePublicStatus, StatusMeta>> = {
  [VEHICLE_PUBLIC_STATUS.DRAFT]: { label: 'Nháp', color: 'default' },
  [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW]: { label: 'Chờ duyệt public', color: 'gold' },
  [VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC]: { label: 'Đã duyệt public', color: 'green' },
  [VEHICLE_PUBLIC_STATUS.NEEDS_REVISION]: { label: 'Cần bổ sung', color: 'orange' },
  [VEHICLE_PUBLIC_STATUS.REJECTED]: { label: 'Bị từ chối', color: 'red' },
  [VEHICLE_PUBLIC_STATUS.HIDDEN]: { label: 'Đã ẩn', color: 'default' },
  [VEHICLE_PUBLIC_STATUS.ARCHIVED]: { label: 'Ngừng sử dụng', color: 'default' },
};

/**
 * Trạng thái vận hành của xe — độc lập với trạng thái duyệt public.
 *
 * Một xe có thể `approved_public` (hiện ngoài chợ) nhưng `renting` (đang có khách thuê).
 * Hai trục này không được gộp.
 */
export const VEHICLE_OPERATION_STATUS = {
  AVAILABLE: 'available',
  RENTING: 'renting',
  MAINTENANCE: 'maintenance',
  INACTIVE: 'inactive',
} as const;

export type VehicleOperationStatus =
  (typeof VEHICLE_OPERATION_STATUS)[keyof typeof VEHICLE_OPERATION_STATUS];

export const VEHICLE_OPERATION_STATUS_VALUES = Object.values(
  VEHICLE_OPERATION_STATUS,
) as VehicleOperationStatus[];

export const VEHICLE_OPERATION_STATUS_META: Readonly<Record<VehicleOperationStatus, StatusMeta>> = {
  [VEHICLE_OPERATION_STATUS.AVAILABLE]: { label: 'Sẵn sàng', color: 'green' },
  [VEHICLE_OPERATION_STATUS.RENTING]: { label: 'Đang thuê', color: 'blue' },
  [VEHICLE_OPERATION_STATUS.MAINTENANCE]: { label: 'Bảo dưỡng', color: 'purple' },
  [VEHICLE_OPERATION_STATUS.INACTIVE]: { label: 'Ngừng hoạt động', color: 'default' },
};

/** Loại xe. */
export const VEHICLE_TYPE = {
  CAR: 'car',
  MOTORBIKE: 'motorbike',
} as const;

export type VehicleType = (typeof VEHICLE_TYPE)[keyof typeof VEHICLE_TYPE];
export const VEHICLE_TYPE_VALUES = Object.values(VEHICLE_TYPE) as VehicleType[];

export const VEHICLE_TYPE_LABEL: Readonly<Record<VehicleType, string>> = {
  [VEHICLE_TYPE.CAR]: 'Ô tô',
  [VEHICLE_TYPE.MOTORBIKE]: 'Xe máy',
};

/** Loại dịch vụ cho thuê. */
export const SERVICE_TYPE = {
  SELF_DRIVE: 'self_drive',
  WITH_DRIVER: 'with_driver',
  BOTH: 'both',
  LONG_TERM: 'long_term',
} as const;

export type ServiceType = (typeof SERVICE_TYPE)[keyof typeof SERVICE_TYPE];
export const SERVICE_TYPE_VALUES = Object.values(SERVICE_TYPE) as ServiceType[];

export const SERVICE_TYPE_LABEL: Readonly<Record<ServiceType, string>> = {
  [SERVICE_TYPE.SELF_DRIVE]: 'Tự lái',
  [SERVICE_TYPE.WITH_DRIVER]: 'Có tài xế',
  [SERVICE_TYPE.BOTH]: 'Tự lái & có tài xế',
  [SERVICE_TYPE.LONG_TERM]: 'Thuê dài hạn',
};

/**
 * Nhiên liệu — thuộc tính dữ liệu của xe (không phải trạng thái), nên chỉ có nhãn, không màu.
 * DB lưu String; đây là bộ giá trị chốt để form là select thay vì text trần (ADR 0005).
 */
export const FUEL_TYPE = {
  GASOLINE: 'gasoline',
  DIESEL: 'diesel',
  ELECTRIC: 'electric',
  HYBRID: 'hybrid',
} as const;

export type FuelType = (typeof FUEL_TYPE)[keyof typeof FUEL_TYPE];
export const FUEL_TYPE_VALUES = Object.values(FUEL_TYPE) as FuelType[];

export const FUEL_TYPE_LABEL: Readonly<Record<FuelType, string>> = {
  [FUEL_TYPE.GASOLINE]: 'Xăng',
  [FUEL_TYPE.DIESEL]: 'Dầu (Diesel)',
  [FUEL_TYPE.ELECTRIC]: 'Điện',
  [FUEL_TYPE.HYBRID]: 'Hybrid',
};
