import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type VehicleListItem = Schemas['VehicleListItemDto'];

export interface VehicleFilters {
  q?: string;
  vehicleType?: string;
  serviceType?: string;
  operationStatus?: string;
  publicStatus?: string;
  branchId?: string;
  page?: number;
  limit?: number;
}

export const VEHICLES_DEFAULT_LIMIT = 20;

export function vehicleFiltersToParams(filters: VehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    vehicleType: filters.vehicleType ?? null,
    serviceType: filters.serviceType ?? null,
    operationStatus: filters.operationStatus ?? null,
    publicStatus: filters.publicStatus ?? null,
    branchId: filters.branchId ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? VEHICLES_DEFAULT_LIMIT,
  };
}

/**
 * Đội xe của GIAN HÀNG.
 *
 * Chỉ có phần ĐỌC DANH SÁCH — đủ cho bộ chọn xe khi tạo đơn tay. Toàn bộ hồ sơ 360 của một xe
 * (giấy tờ, bảo dưỡng, KM, nguồn xe) là màn khác với bộ quyền khác, và app native chưa phục vụ.
 *
 * `tenant_id` KHÔNG bao giờ là tham số: backend lấy từ membership (CLAUDE.md mục 5).
 */
export const vehiclesApi = {
  list(filters: VehicleFilters): Promise<Paged<VehicleListItem>> {
    return getApiClient().fetchPage<VehicleListItem>(
      '/vehicles',
      vehicleFiltersToParams(filters),
      VEHICLES_DEFAULT_LIMIT,
    );
  },
};
