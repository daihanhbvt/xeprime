import { DEFAULT_PAGE_SIZE, pickFilter } from '@/constants/filters';
import { startOfAppDay } from '@/lib/datetime';
import { apiGet, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type { AuditLog, AuditLogDetail, AuditLogFilters } from './types';

export const AUDIT_LOGS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type AuditLogListResult = Paged<AuditLog>;

export function filtersToParams(filters: AuditLogFilters): QueryParams {
  return {
    actorScope: pickFilter(filters.actorScope),
    action: pickFilter(filters.action),
    targetType: pickFilter(filters.targetType),
    targetId: filters.targetId ?? null,
    tenantId: filters.tenantId ?? null,
    actorUserId: filters.actorUserId ?? null,
    // URL giữ `YYYY-MM-DD` (giờ VN) → API nhận mốc tuyệt đối: từ 00:00 ngày đầu đến hết ngày cuối.
    dateFrom: filters.dateFrom ? startOfAppDay(filters.dateFrom).toISOString() : null,
    dateTo: filters.dateTo
      ? startOfAppDay(filters.dateTo).add(1, 'day').subtract(1, 'millisecond').toISOString()
      : null,
    page: filters.page ?? 1,
    limit: filters.limit ?? AUDIT_LOGS_DEFAULT_LIMIT,
  };
}

export const fetchAuditLogs = (filters: AuditLogFilters): Promise<AuditLogListResult> =>
  fetchPage<AuditLog>('/platform/audit-logs', filtersToParams(filters), AUDIT_LOGS_DEFAULT_LIMIT);

export const fetchAuditLog = (id: string): Promise<AuditLogDetail> =>
  apiGet<AuditLogDetail>(`/platform/audit-logs/${id}`);
