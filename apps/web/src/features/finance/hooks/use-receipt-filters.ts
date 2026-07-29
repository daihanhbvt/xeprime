'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReceiptFilters } from '../types';

/** Filter danh sách phiếu ở URL searchParams (ADR 0004). Đổi filter tự về trang 1. */
export function useReceiptFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<ReceiptFilters>(() => {
    const num = (key: string): number | undefined => {
      const raw = searchParams.get(key);
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    return {
      type: searchParams.get('type') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      categoryId: searchParams.get('categoryId') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      page: num('page'),
      limit: num('limit'),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<ReceiptFilters>) => {
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
