'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { applyFilterPatch, parseFilters } from '../filter-params';
import type { MarketplaceFilters } from '../types';

/**
 * Filter marketplace nằm ở URL searchParams — ADR 0004.
 *
 * Nhờ vậy link chia sẻ được, nút back hoạt động, F5 không mất filter. Component không tự
 * parse query string; đọc/ghi qua hook này. Logic parse/serialize (CSV cho multi-select,
 * `1` cho boolean) nằm ở `filter-params.ts` — thuần hàm, unit-test được.
 */
export function useMarketplaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<MarketplaceFilters>(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilters = useCallback(
    (patch: Partial<MarketplaceFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      applyFilterPatch(params, patch);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { filters, setFilters };
}
