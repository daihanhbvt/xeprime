'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminTenantFilters } from '../types';

/** Filter danh sách gian hàng ở URL searchParams (ADR 0004). Mặc định xem tất cả. */
export function useAdminTenantFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<AdminTenantFilters>(() => {
    const page = Number(searchParams.get('page'));
    return {
      status: searchParams.get('status') ?? 'all',
      q: searchParams.get('q') ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<AdminTenantFilters>) => {
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
