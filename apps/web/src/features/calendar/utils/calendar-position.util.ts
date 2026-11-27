import type { CalendarEvent, CalendarRange } from '../types/calendar.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

/**
 * Mức HỞ của một đầu thẻ trong ô ngày (người dùng chốt 26/11/2026): thẻ đơn chiếm trọn các ô từ
 * ngày nhận tới ngày trả; giờ nhận/trả chỉ quyết đầu thẻ hở ra bao nhiêu, không đặt thẻ theo tỉ lệ
 * giờ - đặt theo tỉ lệ thì hai chuyến cùng ngày (08h và 13h) bị vẽ lệch sang ngày kế.
 *
 *  - `0` khít: nhận trước 07h · trả sau 19h (hoặc đúng 00h hôm sau);
 *  - `1` hở ít: nhận 07h-12h · trả 12h-19h;
 *  - `2` hở nhiều: nhận từ 12h · trả từ 12h trở về trước.
 *
 * Mốc "khít" KHÔNG đối xứng: 7 tiếng từ mép trái (07h) nhưng 5 tiếng từ mép phải (19h) - trả xe
 * chiều tối vẫn là hở ít (người dùng chốt 26/11/2026).
 */
export type DayEdgeGap = 0 | 1 | 2;

export interface DaySnapPosition {
  /** Ô ngày (tính từ đầu khoảng xem) chứa giờ nhận. */
  startDay: number;
  /** Ô ngày chứa giờ trả (TÍNH CẢ ô đó). */
  endDay: number;
  startGap: DayEdgeGap;
  endGap: DayEdgeGap;
  clippedStart: boolean;
  clippedEnd: boolean;
}

const MS_PER_HOUR = 60 * 60 * 1000;
/** Nhận trước 07h (7 tiếng tính từ mép trái) là "khít". */
const START_FLUSH_HOURS = 7;
/** Trả sau 19h (5 tiếng tính từ mép phải) là "khít". */
const END_FLUSH_HOURS = 5;
/** Mốc giữa ngày: qua nó là "hở nhiều". */
const EDGE_HALF_DAY_HOURS = 12;

function gapFromEdge(hoursFromEdge: number, flushHours: number): DayEdgeGap {
  if (hoursFromEdge < flushHours) return 0;
  if (hoursFromEdge < EDGE_HALF_DAY_HOURS) return 1;
  return 2;
}

/**
 * Vị trí THEO Ô NGÀY của một event. `range.startAt` là 00h giờ Việt Nam (không có giờ mùa hè), nên
 * giờ trong ngày đọc thẳng từ khoảng cách tới đầu khoảng xem.
 */
export function computeDaySnap(
  event: Pick<CalendarEvent, 'startAt' | 'endAt'>,
  range: CalendarRange,
): DaySnapPosition | null {
  const eventStart = new Date(event.startAt).getTime();
  const eventEnd = new Date(event.endAt).getTime();
  const rangeStart = range.startAt.getTime();
  const rangeEnd = range.endAt.getTime();
  if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) return null;
  if (eventEnd <= rangeStart || eventStart >= rangeEnd || eventEnd <= eventStart) return null;

  const clippedStart = eventStart < rangeStart;
  const clippedEnd = eventEnd > rangeEnd;

  const fromStart = Math.max(eventStart, rangeStart) - rangeStart;
  const startDay = Math.floor(fromStart / MS_PER_DAY);
  const startHour = (fromStart - startDay * MS_PER_DAY) / MS_PER_HOUR;

  const fromEnd = Math.min(eventEnd, rangeEnd) - rangeStart;
  // Trả đúng 00h ⇒ thuộc ngày HÔM TRƯỚC, khít mép phải.
  const endDay = Math.max(startDay, Math.ceil(fromEnd / MS_PER_DAY) - 1);
  const endHour = (fromEnd - endDay * MS_PER_DAY) / MS_PER_HOUR;

  return {
    startDay,
    endDay,
    startGap: clippedStart ? 0 : gapFromEdge(startHour, START_FLUSH_HOURS),
    endGap: clippedEnd ? 0 : gapFromEdge(24 - endHour, END_FLUSH_HOURS),
    clippedStart,
    clippedEnd,
  };
}
