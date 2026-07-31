import type { PaginationMeta } from '@xeprime/types';
import { startOfAppDay } from '@/lib/datetime';
import { apiGet, apiRequest, type QueryParams } from '@/services/api-client';
import type { AuditLog, AuditLogDetail, AuditLogFilters } from './types';

export const AUDIT_LOGS_DEFAULT_LIMIT = 20;

export interface AuditLogListResult {
  items: AuditLog[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: AuditLogFilters): QueryParams {
  const pick = (v: string | undefined) => (v && v !== 'all' ? v : null);
  return {
    actorScope: pick(filters.actorScope),
    action: pick(filters.action),
    targetType: pick(filters.targetType),
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

export async function fetchAuditLogs(filters: AuditLogFilters): Promise<AuditLogListResult> {
  const res = await apiRequest<AuditLog[]>('/platform/audit-logs', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: AUDIT_LOGS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchAuditLog = (id: string): Promise<AuditLogDetail> =>
  apiGet<AuditLogDetail>(`/platform/audit-logs/${id}`);
