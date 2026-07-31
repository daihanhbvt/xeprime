import type { PaginationMeta } from '@xeprime/types';
import { apiDelete, apiPatch, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { AddStaffInput, Staff, StaffFilters, UpdateStaffRoleInput } from './types';

export const STAFF_DEFAULT_LIMIT = 20;

export interface StaffListResult {
  items: Staff[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: StaffFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? STAFF_DEFAULT_LIMIT,
  };
}

export async function fetchStaff(filters: StaffFilters): Promise<StaffListResult> {
  const res = await apiRequest<Staff[]>('/platform/staff', { query: filtersToParams(filters) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: STAFF_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const addStaff = (body: AddStaffInput): Promise<Staff> =>
  apiPost<Staff>('/platform/staff', body);

export const updateStaffRole = (userId: string, body: UpdateStaffRoleInput): Promise<Staff> =>
  apiPatch<Staff>(`/platform/staff/${userId}`, body);

export const removeStaff = (userId: string): Promise<{ userId: string }> =>
  apiDelete<{ userId: string }>(`/platform/staff/${userId}`);
