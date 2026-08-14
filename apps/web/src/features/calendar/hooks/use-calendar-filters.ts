'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CalendarFilters } from '../types/calendar.types';
import { todayIsoDate } from '../utils/calendar-date.util';

const DEFAULT_DAYS = 14;
const MIN_DAYS = 1;
const MAX_DAYS = 62;

/**
 * Các kiểu sắp xếp hàng xe — nhãn cho toolbar, value khớp `CALENDAR_SORT_VALUES` của backend.
 * Mặc định `next_booking`: xe có lịch đang chạy/sắp tới gần nhất lên đầu.
 */
export const CALENDAR_SORT_OPTIONS = [
  { value: 'next_booking', label: 'Lịch gần nhất' },
  { value: 'name', label: 'Tên xe' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
] as const;

/**
 * Filter lịch sống ở URL, KHÔNG ở Redux — ADR 0004.
 *
 * Tài liệu gốc (`xeprime_fe_base_stack_calendar.md` §5.1) xếp filter vào Redux. Đổi vì ba
 * hành vi người dùng mong đợi ở app quản lý mà Redux không cho:
 *   - gửi link "lịch xe máy tháng 8" cho đồng nghiệp
 *   - nút Back hoàn tác filter thay vì văng khỏi trang
 *   - F5 không mất filter
 */
/** `null` = xoá tham số khỏi URL (về mặc định) — dùng cho filter có default như `sort`. */
type CalendarFilterPatch = { [K in keyof CalendarFilters]?: CalendarFilters[K] | null };

export function useCalendarFilters(): {
  filters: CalendarFilters;
  setFilters: (patch: CalendarFilterPatch) => void;
  reset: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<CalendarFilters>(() => {
    const rawDays = Number(searchParams.get('days'));
    const rawSort = searchParams.get('sort');
    return {
      from: searchParams.get('from') ?? todayIsoDate(),
      days:
        Number.isFinite(rawDays) && rawDays >= MIN_DAYS && rawDays <= MAX_DAYS
          ? Math.trunc(rawDays)
          : DEFAULT_DAYS,
      vehicleType: searchParams.get('vehicleType'),
      q: searchParams.get('q'),
      // Giá trị lạ trên URL rơi về mặc định — backend cũng validate lại (IsIn).
      sort: CALENDAR_SORT_OPTIONS.some((o) => o.value === rawSort)
        ? (rawSort as CalendarFilters['sort'])
        : 'next_booking',
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (patch: CalendarFilterPatch) => {
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
