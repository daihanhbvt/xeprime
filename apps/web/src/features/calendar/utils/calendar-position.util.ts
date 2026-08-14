import type { CalendarEvent, CalendarRange, EventBarPosition } from '../types/calendar.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tính vị trí thanh event trong lưới.
 *
 * Trả về đơn vị "ngày" thay vì pixel: component nhân với chiều rộng cột thật lúc render,
 * nên logic này test được mà không cần DOM, và đổi zoom level không phải sửa ở đây.
 *
 * Event nằm ngoài khoảng đang xem bị **clamp** vào biên chứ không bị bỏ: một đơn thuê kéo
 * dài 3 tuần vẫn phải hiện thanh chạy suốt khoảng đang xem.
 */
export function computeEventPosition(
  event: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  range: CalendarRange,
): EventBarPosition | null {
  const eventStart = new Date(event.startAt).getTime();
  const eventEnd = new Date(event.endAt).getTime();
  const rangeStart = range.startAt.getTime();
  const rangeEnd = range.endAt.getTime();

  if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) return null;

  // Nửa mở: event kết thúc đúng lúc khoảng bắt đầu thì không hiện.
  if (eventEnd <= rangeStart || eventStart >= rangeEnd) return null;

  const clippedStart = eventStart < rangeStart;
  const clippedEnd = eventEnd > rangeEnd;

  const visibleStart = Math.max(eventStart, rangeStart);
  const visibleEnd = Math.min(eventEnd, rangeEnd);

  return {
    offsetDays: (visibleStart - rangeStart) / MS_PER_DAY,
    spanDays: Math.max((visibleEnd - visibleStart) / MS_PER_DAY, 0),
    clippedStart,
    clippedEnd,
  };
}

/** Chuyển vị trí sang CSS custom property cho component đọc (ADR 0003). */
export function positionToCssVars(
  position: EventBarPosition,
  dayWidthPx: number,
): Record<string, string> {
  return {
    '--xp-bar-left': `${position.offsetDays * dayWidthPx}px`,
    '--xp-bar-width': `${Math.max(position.spanDays * dayWidthPx, 4)}px`,
  };
}

/**
 * Xếp các event của cùng một xe thành nhiều tầng khi chúng chồng nhau.
 *
 * Về lý thuyết ADR 0006 khiến hai đơn không thể chồng nhau. Nhưng lịch còn hiển thị cả
 * booking request chưa duyệt (không giữ chỗ) và các nguồn khác, nên việc chồng vẫn xảy ra
 * trên UI — chồng thanh lên nhau sẽ che mất dữ liệu.
 */
/**
 * Xếp tầng theo VỊ TRÍ PIXEL đã vẽ, không theo thời gian.
 *
 * Cần bản này vì thanh event có SÀN bề rộng (event 2–3 tiếng vẫn phải đủ chỗ cho icon + chữ):
 * hai event không chồng nhau về thời gian vẫn có thể chồng nhau trên màn hình sau khi nới —
 * xếp tầng theo giờ sẽ để chúng đè lên nhau. Trả về lane theo ĐÚNG thứ tự mảng vào.
 */
export function assignPixelLanes(items: ReadonlyArray<{ left: number; width: number }>): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.left - items[b]!.left);
  const laneEnds: number[] = [];
  const lanes = new Array<number>(items.length).fill(0);

  for (const idx of order) {
    const { left, width } = items[idx]!;
    let lane = laneEnds.findIndex((end) => end <= left);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(left + width);
    } else {
      laneEnds[lane] = left + width;
    }
    lanes[idx] = lane;
  }

  return lanes;
}

export function assignLanes<T extends { startAt: string; endAt: string }>(
  events: readonly T[],
): Array<{ event: T; lane: number }> {
  const sorted = [...events].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  const laneEnds: number[] = [];
  const result: Array<{ event: T; lane: number }> = [];

  for (const event of sorted) {
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    result.push({ event, lane });
  }

  return result;
}
