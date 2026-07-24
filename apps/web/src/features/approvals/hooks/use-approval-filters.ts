'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ApprovalFilters } from '../types';

/** Filter hàng đợi duyệt ở URL searchParams (ADR 0004). Mặc định lọc phiếu đang chờ. */
export function useApprovalFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<ApprovalFilters>(() => {
    const page = Number(searchParams.get('page'));
    return {
      status: searchParams.get('status') ?? 'pending',
      targetType: searchParams.get('targetType') ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : undefined,
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<ApprovalFilters>) => {
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
