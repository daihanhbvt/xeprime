import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiDelete,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type { AddStaffInput, Staff, StaffFilters, UpdateStaffRoleInput } from './types';

export const STAFF_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type StaffListResult = Paged<Staff>;

export function filtersToParams(filters: StaffFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? STAFF_DEFAULT_LIMIT,
  };
}

export const fetchStaff = (filters: StaffFilters): Promise<StaffListResult> =>
  fetchPage<Staff>('/platform/staff', filtersToParams(filters), STAFF_DEFAULT_LIMIT);

export const addStaff = (body: AddStaffInput): Promise<Staff> =>
  apiPost<Staff>('/platform/staff', body);

export const updateStaffRole = (userId: string, body: UpdateStaffRoleInput): Promise<Staff> =>
  apiPatch<Staff>(`/platform/staff/${userId}`, body);

export const removeStaff = (userId: string): Promise<{ userId: string }> =>
  apiDelete<{ userId: string }>(`/platform/staff/${userId}`);
