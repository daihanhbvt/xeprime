import type { components } from '@xeprime/types';

/** Type gian hàng (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminTenant = Schemas['PlatformTenantDto'];
export type AdminTenantDetail = Schemas['PlatformTenantDetailDto'];

/** Filter danh sách gian hàng — ở URL searchParams (ADR 0004). */
export interface AdminTenantFilters {
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}
