'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import type { BookingRequestFilters } from '../types';

/**
 * Filter inbox ở URL searchParams (ADR 0004). Mặc định lọc `pending_host_approval` — inbox
 * mở ra là thấy ngay việc cần xử lý.
 */
export function useBookingRequestFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<BookingRequestFilters>(() => {
    const numberParam = (key: string): number | undefined => {
      const raw = searchParams.get(key);
      if (!raw) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    return {
      status: searchParams.get('status') ?? BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      vehicleId: searchParams.get('vehicleId') ?? undefined,
      page: numberParam('page'),
      limit: numberParam('limit'),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<BookingRequestFilters>) => {
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
