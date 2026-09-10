import { useCallback, useMemo, useState } from 'react';
import { CALENDAR_SORT_VALUES, type CalendarFilters, type CalendarSort } from '../api';
import { todayIsoDate } from '../utils/calendar-date.util';

/**
 * Khoảng xem mặc định — **3 ngày trên app**, khác web (web mở 14 ở mọi viewport).
 *
 * Đây là một quyết định SẢN PHẨM, không phải app tự rút gọn: 14 cột trên màn 360dp cho ra ô rộng
 * ~23dp — hẹp hơn cả một đầu ngón tay, nên vừa không đọc được thanh event vừa không chạm trúng ô
 * nào. Người dùng vẫn đổi sang 7 hoặc 14 ngày trong bộ lọc bất cứ lúc nào (`CALENDAR_DAY_OPTIONS`),
 * và mỗi lựa chọn đó hỏi backend đúng khoảng đã chọn — nên không có dữ liệu nào bị giấu đi.
 *
 * Vì lệch web, con số này phải đứng MỘT CHỖ: đổi ở đây là đổi cả giá trị khởi tạo lẫn giá trị
 * "về mặc định" của `setFilters({ days: null })`.
 */
export const DEFAULT_DAYS = 3;
/** Sắp xếp mặc định — cùng giá trị web mở sẵn. Đứng cạnh `DEFAULT_DAYS` vì cùng vai trò. */
export const DEFAULT_SORT = 'next_booking';

const MIN_DAYS = 1;
const MAX_DAYS = 62;

/**
 * Các khoảng xem chọn được trên app.
 *
 * Web dựng 3/7/14 cho viewport hẹp và 7/14/30 cho desktop (`CalendarToolbar`); app lấy ĐÚNG bộ
 * hẹp đó. 30 cột trên 360dp cho ra ô 10dp — không đọc được và không chạm trúng.
 */
export const CALENDAR_DAY_OPTIONS = [3, 7, 14] as const;

export interface CalendarFilterSeed {
  /** Từ khoá lọc sẵn — lối đi "Xem lịch" của một xe truyền biển số vào đây, y như web. */
  q?: string | undefined;
  from?: string | undefined;
  days?: string | undefined;
}

/** `null` = trả filter về mặc định — cùng ngữ nghĩa "xoá tham số khỏi URL" của web. */
export type CalendarFilterPatch = {
  [K in keyof CalendarFilters]?: CalendarFilters[K] | null;
};

export interface CalendarFilterState {
  filters: CalendarFilters;
  setFilters: (patch: CalendarFilterPatch) => void;
  reset: () => void;
  /** Có đang thu hẹp tập xe không — quyết định trạng thái rỗng nào được hiện. */
  filtered: boolean;
}

function clampDays(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw < MIN_DAYS || raw > MAX_DAYS) {
    return DEFAULT_DAYS;
  }
  return Math.trunc(raw);
}

/**
 * Bộ lọc lưới lịch — bản native của `useCalendarFilters` bên web.
 *
 * Khác web đúng ở CHỖ CHỨA, không ở nội dung: web giữ filter trên URL (ADR 0004) để gửi link và
 * để nút Back hoàn tác; app không có thanh địa chỉ, nên giá trị sống ở state của màn và chỉ được
 * GIEO từ route param lúc mở màn (`?q=` của lối "Xem lịch"). Bộ khoá, giá trị mặc định và luật
 * kẹp thì giữ nguyên — hai client phải hỏi backend cùng một câu.
 *
 * Giá trị lạ rơi về mặc định ở đây, và backend vẫn validate lại (`IsIn`).
 */
export function useCalendarFilters(seed: CalendarFilterSeed = {}): CalendarFilterState {
  const [filters, setState] = useState<CalendarFilters>(() => ({
    from: seed.from ?? todayIsoDate(),
    days: clampDays(seed.days === undefined ? undefined : Number(seed.days)),
    vehicleType: null,
    q: seed.q?.trim() ? seed.q.trim() : null,
    sort: 'next_booking',
  }));

  const setFilters = useCallback((patch: CalendarFilterPatch) => {
    setState((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        const field = key as keyof CalendarFilters;
        if (value === null || value === undefined || value === '') {
          // Về MẶC ĐỊNH, không phải về `null` — `from`/`days`/`sort` luôn phải có giá trị.
          if (field === 'from') next.from = todayIsoDate();
          else if (field === 'days') next.days = DEFAULT_DAYS;
          else if (field === 'sort') next.sort = 'next_booking';
          else if (field === 'q') next.q = null;
          else if (field === 'vehicleType') next.vehicleType = null;
          continue;
        }
        if (field === 'days') next.days = clampDays(Number(value));
        else if (field === 'sort') {
          next.sort = CALENDAR_SORT_VALUES.some((v) => v === value)
            ? (value as CalendarSort)
            : 'next_booking';
        } else if (field === 'from') next.from = String(value);
        else if (field === 'q') next.q = String(value);
        else next.vehicleType = String(value);
      }
      /*
       * Không đổi gì thì trả về CHÍNH object cũ — React bỏ qua lượt render, và bốn query của lưới
       * giữ nguyên tham chiếu bộ lọc.
       *
       * Cần thật, không phải tối ưu vặt: hiệu ứng tìm kiếm chạy một lần lúc mở màn và ghi lại đúng
       * cái `q` vừa gieo từ route param. Trả object mới ở đó là một lượt render thừa ngay trên
       * đường vào của lối "Xem lịch".
       */
      const unchanged = (Object.keys(next) as Array<keyof CalendarFilters>).every(
        (key) => next[key] === current[key],
      );
      return unchanged ? current : next;
    });
  }, []);

  const reset = useCallback(
    () =>
      setState({
        from: todayIsoDate(),
        days: DEFAULT_DAYS,
        vehicleType: null,
        q: null,
        sort: 'next_booking',
      }),
    [],
  );

  return useMemo(
    () => ({
      filters,
      setFilters,
      reset,
      filtered: Boolean(filters.q || filters.vehicleType),
    }),
    [filters, reset, setFilters],
  );
}
