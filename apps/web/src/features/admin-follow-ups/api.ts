import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import {
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  FollowUp,
  FollowUpAssignee,
  FollowUpContact,
  FollowUpFilters,
  UpdateFollowUpInput,
} from './types';

const BASE = '/platform/follow-ups';

export const FOLLOW_UPS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function filtersToParams(filters: FollowUpFilters): QueryParams {
  return {
    q: filters.q ?? null,
    phone: filters.phone ?? null,
    reason: pickFilter(filters.reason),
    followUpStatus: pickFilter(filters.followUpStatus),
    mine: filters.mine ? 'true' : null,
    // Server tự đổi `YYYY-MM-DD` thành biên ngày giờ Việt Nam.
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? FOLLOW_UPS_DEFAULT_LIMIT,
  };
}

export const fetchFollowUps = (filters: FollowUpFilters): Promise<Paged<FollowUp>> =>
  fetchPage<FollowUp>(BASE, filtersToParams(filters), FOLLOW_UPS_DEFAULT_LIMIT);

export const updateFollowUp = (id: string, body: UpdateFollowUpInput): Promise<FollowUp> =>
  apiPatch<FollowUp>(`${BASE}/${id}`, body);

/** Bỏ che SĐT/email. Mỗi lần gọi là một dòng audit ở backend — không gọi ngầm/tự động. */
export const revealFollowUpContact = (id: string): Promise<FollowUpContact> =>
  apiPost<FollowUpContact>(`${BASE}/${id}/contact`);

/** Nhân sự giao được làm phụ trách — chỉ người có quyền chăm sóc khách (server lọc). */
export const fetchFollowUpAssignees = (): Promise<FollowUpAssignee[]> =>
  apiGet<FollowUpAssignee[]>(`${BASE}/assignees`);
