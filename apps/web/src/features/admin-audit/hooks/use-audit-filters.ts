'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AuditLogFilters } from '../types';

/** Filter nhật ký ở URL searchParams (ADR 0004). Mặc định xem tất cả, mới nhất trước. */
export function useAuditFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<AuditLogFilters>(() => {
    const page = Number(searchParams.get('page'));
    return {
      actorScope: searchParams.get('actorScope') ?? 'all',
      action: searchParams.get('action') ?? 'all',
      targetType: searchParams.get('targetType') ?? 'all',
      targetId: searchParams.get('targetId') ?? undefined,
      tenantId: searchParams.get('tenantId') ?? undefined,
      actorUserId: searchParams.get('actorUserId') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<AuditLogFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      if (!('page' in patch)) params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { filters, setFilters };
}
