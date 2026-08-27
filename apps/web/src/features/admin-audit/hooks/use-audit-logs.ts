'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAuditLog, fetchAuditLogs, filtersToParams } from '../api';
import type { AuditLogFilters } from '../types';

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filtersToParams(filters)],
    queryFn: () => fetchAuditLogs(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAuditLog(id: string | null) {
  return useQuery({
    queryKey: ['audit-log', id],
    queryFn: () => fetchAuditLog(id as string),
    enabled: Boolean(id),
  });
}
