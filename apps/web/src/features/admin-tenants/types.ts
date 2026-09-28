import type { PlatformPartnerKind, PlatformTenantSort, components } from '@xeprime/types';

/** Type gian hàng (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminTenant = Schemas['PlatformTenantDto'];
export type AdminTenantDetail = Schemas['PlatformTenantDetailDto'];

/**
 * Filter gửi lên `GET /platform/tenants`.
 *
 * `partnerKind` KHÔNG đến từ URL: mỗi route danh sách đối tác cố định loại của nó, nên sửa query
 * string không đưa được đối tác loại này sang danh sách kia.
 */
export interface AdminTenantFilters {
  partnerKind?: PlatformPartnerKind;
  status?: string;
  q?: string;
  sort?: PlatformTenantSort;
  page?: number;
  limit?: number;
}

/** State của danh sách đối tác ở URL searchParams (ADR 0004) — bộ lọc + gian hàng đang mở. */
export interface AdminPartnerListUrlState extends Omit<AdminTenantFilters, 'partnerKind'> {
  /** Gian hàng đang mở ở panel chi tiết — sống ở URL để F5/link giữ nguyên chỗ đang xem. */
  tenant?: string;
  /** Tab đang mở của drawer — kiểm hợp lệ theo loại đối tác lúc dựng (`partnerDetailTabOf`). */
  tab?: string;
}
