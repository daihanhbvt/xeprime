'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CalendarFilters } from '../types/calendar.types';
import { todayIsoDate } from '../utils/calendar-date.util';

const DEFAULT_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 62;

/**
 * Filter lịch sống ở URL, KHÔNG ở Redux — ADR 0004.
 *
 * Tài liệu gốc (`xeprime_fe_base_stack_calendar.md` §5.1) xếp filter vào Redux. Đổi vì ba
 * hành vi người dùng mong đợi ở app quản lý mà Redux không cho:
 *   - gửi link "lịch xe máy tháng 8" cho đồng nghiệp
 *   - nút Back hoàn tác filter thay vì văng khỏi trang
 *   - F5 không mất filter
 */
export function useCalendarFilters(): {
  filters: CalendarFilters;
  setFilters: (patch: Partial<CalendarFilters>) => void;
  reset: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<CalendarFilters>(() => {
    const rawDays = Number(searchParams.get('days'));
    return {
      from: searchParams.get('from') ?? todayIsoDate(),
      days:
        Number.isFinite(rawDays) && rawDays >= MIN_DAYS && rawDays <= MAX_DAYS
          ? Math.trunc(rawDays)
          : DEFAULT_DAYS,
      vehicleType: searchParams.get('vehicleType'),
      q: searchParams.get('q'),
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: Partial<CalendarFilters>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }

      // `replace` chứ không `push`: gõ từng ký tự vào ô tìm kiếm không nên tạo ra
      // 20 mục trong lịch sử trình duyệt.
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, setFilters, reset };
}
