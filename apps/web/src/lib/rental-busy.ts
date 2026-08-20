import type { Dayjs } from 'dayjs';

import type { VehicleBusyDay } from '@/features/booking-requests/types';

import { DAY_PARAM_FORMAT, dayjs } from './datetime';

/**
 * Lịch bận của một xe, ở dạng TRA CỨU — nguồn cho cả ba việc mà hộp chọn thời gian thuê phải
 * làm: khoá ngày bận trọn, tô riêng ngày bận một phần, và chặn khoảng đi xuyên qua ngày bận.
 *
 * Phép lệch múi giờ ở đây là CÓ CHỦ Ý và chỉ có một chỗ: server trả `date` theo ngày lịch Việt
 * Nam, còn lịch trên màn hình là các `Date` giờ máy. Ô "25/08" trên lưới luôn được tra bằng
 * đúng khoá `2026-08-25` ({@link busyDayKey}) — tức là ô lịch nào thì ngày nghiệp vụ ấy. Riêng
 * phép so KHOẢNG ({@link rangeBusyConflict}) đối chiếu mốc tuyệt đối nên đúng ở mọi múi giờ.
 */
export type BusyLevel = 'free' | 'partial' | 'full';

export interface BusyPeriod {
  readonly startAt: Dayjs;
  readonly endAt: Dayjs;
}

export interface BusyDayInfo {
  readonly date: string;
  readonly fullyBusy: boolean;
  readonly periods: readonly BusyPeriod[];
}

/** Bảng tra theo khoá ngày `YYYY-MM-DD`. Rỗng = chưa có dữ liệu hoặc xe rảnh cả cửa sổ. */
export type BusyDayIndex = ReadonlyMap<string, BusyDayInfo>;

export const EMPTY_BUSY_INDEX: BusyDayIndex = new Map();

/** Khoá tra cứu của một ngày trên lưới lịch — chính là ngày đang hiển thị trong ô. */
export function busyDayKey(day: Date | Dayjs): string {
  return dayjs(day).format(DAY_PARAM_FORMAT);
}

/** DTO (ISO trên dây) → bảng tra (Dayjs để so sánh thẳng với giá trị đang chọn). */
export function buildBusyDayIndex(days: readonly VehicleBusyDay[] | undefined): BusyDayIndex {
  if (!days?.length) return EMPTY_BUSY_INDEX;
  return new Map(
    days.map((d) => [
      d.date,
      {
        date: d.date,
        fullyBusy: d.fullyBusy,
        periods: d.periods.map((p) => ({ startAt: dayjs(p.startAt), endAt: dayjs(p.endAt) })),
      },
    ]),
  );
}

export function busyLevelOf(index: BusyDayIndex, day: Date | Dayjs): BusyLevel {
  const info = index.get(busyDayKey(day));
  if (!info) return 'free';
  return info.fullyBusy ? 'full' : 'partial';
}

/** Các quãng bận trong một ngày — rỗng với ngày rảnh và với ngày bận trọn. */
export function busyPeriodsOf(index: BusyDayIndex, day: Date | Dayjs): readonly BusyPeriod[] {
  return index.get(busyDayKey(day))?.periods ?? [];
}

/**
 * Ngày CÓ LỊCH BẬN gần nhất sau `from` (không tính chính ngày đó), trong `limitDays` ngày tới.
 *
 * Dùng để chặn khoảng thuê đi xuyên qua ngày bận: một khoảng 21→27/08 mà 25/08 bận thì cả
 * khoảng đó bất khả thi, dù hai đầu đều rảnh. Trả về cả ngày bận một phần — ngày như vậy chỉ
 * dùng làm ngày TRẢ được (trả trước giờ bận), nằm giữa khoảng thì vẫn là đụng.
 */
export function firstBusyDayAfter(
  index: BusyDayIndex,
  from: Dayjs,
  limitDays: number,
): { date: Dayjs; level: Exclude<BusyLevel, 'free'> } | null {
  if (index.size === 0) return null;
  const start = from.startOf('day');
  for (let i = 1; i <= limitDays; i++) {
    const day = start.add(i, 'day');
    const level = busyLevelOf(index, day);
    if (level !== 'free') return { date: day, level };
  }
  return null;
}

/**
 * Quãng bận ĐẦU TIÊN mà khoảng `[pickupAt, returnAt)` đụng phải, hoặc `null` nếu sạch.
 *
 * So bằng mốc tuyệt đối và nửa mở giống hệt exclusion constraint (`[)` — trả 10:00 rồi nhận
 * 10:00 KHÔNG tính là đụng), để lời cảnh báo trên màn khớp với thứ server sẽ từ chối.
 *
 * Chỉ soi được các ngày bận MỘT PHẦN: ngày bận trọn không mang `periods` (lịch đã khoá thẳng
 * ô đó nên không có gì để cảnh báo).
 */
export function rangeBusyConflict(
  index: BusyDayIndex,
  pickupAt: Dayjs | null,
  returnAt: Dayjs | null,
): BusyPeriod | null {
  if (!pickupAt || !returnAt || index.size === 0) return null;

  let day = pickupAt.startOf('day');
  const last = returnAt.startOf('day');
  while (!day.isAfter(last)) {
    for (const period of busyPeriodsOf(index, day)) {
      if (period.startAt.isBefore(returnAt) && period.endAt.isAfter(pickupAt)) return period;
    }
    day = day.add(1, 'day');
  }
  return null;
}
