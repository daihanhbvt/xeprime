import { PLATFORM_VEHICLE_VIEW, type PaginationMeta } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  AdminVehicle,
  AdminVehicleCounts,
  AdminVehicleDetail,
  AdminVehicleFilters,
} from './types';

const BASE = '/platform/vehicles';

export const ADMIN_VEHICLES_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export interface AdminVehicleListResult {
  items: AdminVehicle[];
  meta: PaginationMeta;
  /** Số xe của từng góc nhìn nhanh — cùng lần đọc với danh sách. */
  counts: AdminVehicleCounts;
}

const EMPTY_COUNTS: AdminVehicleCounts = {
  [PLATFORM_VEHICLE_VIEW.ALL]: 0,
  [PLATFORM_VEHICLE_VIEW.VISIBLE]: 0,
  [PLATFORM_VEHICLE_VIEW.PENDING_REVIEW]: 0,
  [PLATFORM_VEHICLE_VIEW.PLATFORM_HIDDEN]: 0,
  [PLATFORM_VEHICLE_VIEW.SUSPENDED_SHOP]: 0,
};

export function filtersToParams(filters: AdminVehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    tenantId: filters.tenantId ?? null,
    publicStatus: pickFilter(filters.publicStatus),
    operationStatus: pickFilter(filters.operationStatus),
    vehicleType: pickFilter(filters.vehicleType),
    serviceType: pickFilter(filters.serviceType),
    provinceCode: pickFilter(filters.provinceCode),
    tenantStatus: pickFilter(filters.tenantStatus),
    // `'all'` → bỏ hẳn tham số; `'true'`/`'false'` đi thẳng lên dây, backend tự ép kiểu boolean.
    marketplaceVisible: pickFilter(filters.marketplaceVisible),
    // Không gửi `sort` khi là mặc định — server đã biết mặc định của nó.
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? ADMIN_VEHICLES_DEFAULT_LIMIT,
  };
}

/**
 * Envelope riêng: ngoài `data`/`meta` còn mang `counts` cho hàng tab góc nhìn. Số trên tab và danh
 * sách đến từ CÙNG một lần đọc — tách ra request thứ hai là mở đường cho tab "Chờ duyệt (3)"
 * trong khi danh sách hiện hai dòng.
 */
interface AdminVehicleEnvelope {
  data: AdminVehicle[];
  meta?: PaginationMeta;
  counts?: AdminVehicleCounts;
}

export async function fetchAdminVehicles(
  filters: AdminVehicleFilters,
): Promise<AdminVehicleListResult> {
  const res = (await apiRequest<AdminVehicle[]>(BASE, {
    query: filtersToParams(filters),
  })) as AdminVehicleEnvelope;
  return {
    items: res.data,
    meta: res.meta ?? {
      page: 1,
      limit: ADMIN_VEHICLES_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
    counts: res.counts ?? EMPTY_COUNTS,
  };
}

export const fetchAdminVehicle = (id: string): Promise<AdminVehicleDetail> =>
  apiGet<AdminVehicleDetail>(`${BASE}/${id}`);

export const hideVehicle = (id: string, reason: string): Promise<AdminVehicleDetail> =>
  apiPost<AdminVehicleDetail>(`${BASE}/${id}/hide`, { reason });

export const unhideVehicle = (id: string): Promise<AdminVehicleDetail> =>
  apiPost<AdminVehicleDetail>(`${BASE}/${id}/unhide`);
