'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AuditLogFilters } from '../types';

/**
 * Filter nhật ký ở URL searchParams (ADR 0004). Mặc định xem tất cả, mới nhất trước.
 *
 * Dời sang `useUrlFilters` ở Wave 1C-D. Hành vi giữ nguyên: bản copy cũ cũng xoá
 * `undefined`/`null`/`''`/`'all'` và cũng reset trang khi đổi filter. Hook chung xoá thêm `false`,
 * nhưng nhật ký không có filter boolean nào nên không có khác biệt nào phát sinh.
 */
export function useAuditFilters() {
  return useUrlFilters<AuditLogFilters>((sp) => ({
    actorScope: sp.get('actorScope') ?? 'all',
    action: sp.get('action') ?? 'all',
    targetType: sp.get('targetType') ?? 'all',
    targetId: sp.get('targetId') ?? undefined,
    tenantId: sp.get('tenantId') ?? undefined,
    actorUserId: sp.get('actorUserId') ?? undefined,
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    page: positiveIntParam(sp, 'page'),
  }));
}
