import { APPROVAL_STATUS } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import {
  apiGet,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type { ApprovalDetail, ApprovalFilters, ApprovalTask } from './types';

export const APPROVALS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type ApprovalListResult = Paged<ApprovalTask>;

export function filtersToParams(filters: ApprovalFilters): QueryParams {
  return {
    // Mặc định chỉ xem hàng đợi CHỜ DUYỆT — đó là việc phải làm, không phải toàn bộ lịch sử.
    status: pickFilter(filters.status ?? APPROVAL_STATUS.PENDING),
    targetType: filters.targetType ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? APPROVALS_DEFAULT_LIMIT,
  };
}

export const fetchApprovals = (filters: ApprovalFilters): Promise<ApprovalListResult> =>
  fetchPage<ApprovalTask>('/platform/approvals', filtersToParams(filters), APPROVALS_DEFAULT_LIMIT);

export const fetchApproval = (id: string): Promise<ApprovalDetail> =>
  apiGet<ApprovalDetail>(`/platform/approvals/${id}`);

export const approveTask = (id: string, reason?: string): Promise<ApprovalDetail> =>
  apiPost<ApprovalDetail>(`/platform/approvals/${id}/approve`, { reason });

export const rejectTask = (id: string, reason: string): Promise<ApprovalDetail> =>
  apiPost<ApprovalDetail>(`/platform/approvals/${id}/reject`, { reason });

export const requestRevisionTask = (id: string, reason: string): Promise<ApprovalDetail> =>
  apiPost<ApprovalDetail>(`/platform/approvals/${id}/request-revision`, { reason });
