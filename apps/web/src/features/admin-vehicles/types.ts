import type { components } from '@xeprime/types';

/** Type xe toàn hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminVehicle = Schemas['PlatformVehicleDto'];
export type AdminVehicleDetail = Schemas['PlatformVehicleDetailDto'];

/** Filter danh sách xe — ở URL searchParams (ADR 0004). */
export interface AdminVehicleFilters {
  q?: string;
  tenantId?: string;
  publicStatus?: string;
  operationStatus?: string;
  vehicleType?: string;
  tenantStatus?: string;
  page?: number;
  limit?: number;
}
