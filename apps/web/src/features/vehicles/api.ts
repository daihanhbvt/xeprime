import type { PaginationMeta } from '@xeprime/types';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  type QueryParams,
} from '@/services/api-client';
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleDetail,
  VehicleFilters,
  VehicleListItem,
  VehicleStats,
} from './types';

export const VEHICLES_DEFAULT_LIMIT = 20;

export interface VehicleListResult {
  items: VehicleListItem[];
  meta: PaginationMeta;
}

/** Filter (URL) → query params gửi API. Bỏ giá trị rỗng để URL và cache key gọn. */
export function filtersToParams(filters: VehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    operationStatus: filters.operationStatus ?? null,
    publicStatus: filters.publicStatus ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? VEHICLES_DEFAULT_LIMIT,
  };
}

export async function fetchVehicles(filters: VehicleFilters): Promise<VehicleListResult> {
  const params = filtersToParams(filters);
  const res = await apiRequest<VehicleListItem[]>('/vehicles', { query: params });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: VEHICLES_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchVehicle = (id: string): Promise<VehicleDetail> =>
  apiGet<VehicleDetail>(`/vehicles/${id}`);

export const createVehicle = (body: CreateVehicleInput): Promise<VehicleDetail> =>
  apiPost<VehicleDetail>('/vehicles', body);

export const updateVehicle = (id: string, body: UpdateVehicleInput): Promise<VehicleDetail> =>
  apiPatch<VehicleDetail>(`/vehicles/${id}`, body);

export const deleteVehicle = (id: string): Promise<{ id: string }> =>
  apiDelete<{ id: string }>(`/vehicles/${id}`);

/** Gửi xe đi duyệt công khai (ADR 0008) — backend tạo phiếu duyệt, không tự set approved_public. */
export const submitVehiclePublic = (id: string): Promise<VehicleDetail> =>
  apiPost<VehicleDetail>(`/vehicles/${id}/submit-public`, {});

/**
 * Chỉ số cho thẻ xe — gọi RIÊNG, sau khi đã có trang danh sách.
 *
 * Tách khỏi `fetchVehicles` để danh sách hiện ngay: tổng hợp thu/chi chậm hơn truy vấn xe, gộp
 * chung sẽ bắt cả trang chờ theo phần chậm nhất. Thống kê hỏng cũng không kéo sập danh sách.
 */
export async function fetchVehicleStats(ids: string[]): Promise<VehicleStats[]> {
  if (ids.length === 0) return [];
  const res = await apiRequest<VehicleStats[]>('/vehicles/stats', {
    query: { ids: ids.join(',') },
  });
  return res.data;
}
