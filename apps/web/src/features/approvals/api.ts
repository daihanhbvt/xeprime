import type { PaginationMeta } from '@xeprime/types';
import { apiGet, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { ApprovalDetail, ApprovalFilters, ApprovalTask } from './types';

export const APPROVALS_DEFAULT_LIMIT = 20;

export interface ApprovalListResult {
  items: ApprovalTask[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: ApprovalFilters): QueryParams {
  const status = filters.status ?? 'pending';
  return {
    // 'all' = xem mọi trạng thái → bỏ tham số (BE chỉ nhận giá trị status hợp lệ).
    status: status === 'all' ? null : status,
    targetType: filters.targetType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? APPROVALS_DEFAULT_LIMIT,
  };
}

export async function fetchApprovals(filters: ApprovalFilters): Promise<ApprovalListResult> {
  const res = await apiRequest<ApprovalTask[]>('/platform/approvals', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: APPROVALS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchApproval = (id: string): Promise<ApprovalDetail> =>
  apiGet<ApprovalDetail>(`/platform/approvals/${id}`);

export const approveTask = (id: string, reason?: string): Promise<ApprovalDetail> =>
  apiPost<ApprovalDetail>(`/platform/approvals/${id}/approve`, { reason });

export const rejectTask = (id: string, reason: string): Promise<ApprovalDetail> =>
  apiPost<ApprovalDetail>(`/platform/approvals/${id}/reject`, { reason });

export const requestRevisionTask = (id: string, reason: string): Promise<ApprovalDetail> =>
  apiPost<ApprovalDetail>(`/platform/approvals/${id}/request-revision`, { reason });
