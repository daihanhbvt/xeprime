'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DebtFilters } from '../types';

/** Filter công nợ ở URL searchParams (ADR 0004). */
export function useDebtFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<DebtFilters>(() => {
    const raw = searchParams.get('page');
    const page = raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    return { filter: searchParams.get('filter') ?? undefined, page };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<DebtFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') params.delete(key);
        else params.set(key, String(value));
      }
      if (!('page' in patch)) params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { filters, setFilters };
}
