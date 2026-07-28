'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MarketplaceFilters } from '../types';

/**
 * Filter marketplace nằm ở URL searchParams — ADR 0004.
 *
 * Nhờ vậy link chia sẻ được, nút back hoạt động, F5 không mất filter. Component không tự
 * parse query string; đọc/ghi qua hook này.
 */
export function useMarketplaceFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<MarketplaceFilters>(() => {
    const num = (key: string): number | undefined => {
      const raw = searchParams.get(key);
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      vehicleType: searchParams.get('vehicleType') ?? undefined,
      serviceType: searchParams.get('serviceType') ?? undefined,
      brand: searchParams.get('brand') ?? undefined,
      minSeats: num('minSeats'),
      q: searchParams.get('q') ?? undefined,
      province: searchParams.get('province') ?? undefined,
      priceMin: num('priceMin'),
      priceMax: num('priceMax'),
      pickupAt: searchParams.get('pickupAt') ?? undefined,
      returnAt: searchParams.get('returnAt') ?? undefined,
      sort: (searchParams.get('sort') as MarketplaceFilters['sort']) ?? undefined,
      page: num('page'),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<MarketplaceFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') params.delete(key);
        else params.set(key, String(value));
      }
      // Đổi filter thì về trang 1, trừ khi chính `page` đang được đổi.
      if (!('page' in patch)) params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { filters, setFilters };
}
