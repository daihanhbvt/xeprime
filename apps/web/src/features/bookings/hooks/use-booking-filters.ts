'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { BookingFilters, BookingSort } from '../types';

/**
 * Filter danh sách đơn ở URL searchParams — ADR 0004. Mọi thay đổi filter đi qua `setFilters`,
 * tự đưa về trang 1 khi đổi bất kỳ filter nào (trừ khi chính `page` đang đổi).
 */
export function useBookingFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<BookingFilters>(() => {
    const numberParam = (key: string): number | undefined => {
      const raw = searchParams.get(key);
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    return {
      q: searchParams.get('q') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      vehicleId: searchParams.get('vehicleId') ?? undefined,
      sort: (searchParams.get('sort') as BookingSort | null) ?? undefined,
      page: numberParam('page'),
      limit: numberParam('limit'),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<BookingFilters>) => {
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
