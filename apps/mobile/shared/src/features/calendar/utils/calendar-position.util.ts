import type { CalendarEvent } from '../api';
import type { CalendarRange } from './calendar-date.util';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Vị trí của thanh event trong lưới, tính theo đơn vị "ngày" (có phần thập phân). */
export interface EventBarPosition {
  offsetDays: number;
  spanDays: number;
  /** Event bắt đầu trước khoảng đang xem — vẽ mép trái phẳng. */
  clippedStart: boolean;
  /** Event kết thúc sau khoảng đang xem. */
  clippedEnd: boolean;
}

/**
 * Tính vị trí thanh event trong lưới.
 *
 * Bản sao của `apps/web/src/features/calendar/utils/calendar-position.util.ts`, cùng phép tính —
 * xem ghi chú ở `calendar-date.util.ts` về việc chưa rút lên package dùng chung.
 *
 * Trả đơn vị "ngày" thay vì pixel: component nhân với bề rộng cột thật lúc render, nên logic này
 * test được không cần dựng cây view, và đổi khoảng xem không phải sửa ở đây.
 *
 * Event nằm ngoài khoảng bị **clamp** vào biên chứ không bị bỏ: một đơn thuê kéo dài 3 tuần vẫn
 * phải hiện thanh chạy suốt khoảng đang xem.
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

  const visibleStart = Math.max(eventStart, rangeStart);
  const visibleEnd = Math.min(eventEnd, rangeEnd);

  return {
    offsetDays: (visibleStart - rangeStart) / MS_PER_DAY,
    spanDays: Math.max((visibleEnd - visibleStart) / MS_PER_DAY, 0),
    clippedStart: eventStart < rangeStart,
    clippedEnd: eventEnd > rangeEnd,
  };
}

/**
 * Xếp tầng theo VỊ TRÍ PIXEL đã vẽ, không theo thời gian.
 *
 * Cần bản này vì thanh event có SÀN bề rộng (event 2–3 tiếng vẫn phải đủ chỗ cho icon + chữ và
 * đủ lớn để chạm): hai event không chồng nhau về thời gian vẫn có thể chồng nhau trên màn hình
 * sau khi nới — xếp tầng theo giờ sẽ để chúng đè lên nhau. Trả lane theo ĐÚNG thứ tự mảng vào.
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

/**
 * Sàn bề rộng thanh event — đơn vài tiếng vẽ theo tỉ lệ thật chỉ còn vài pixel: không đọc được,
 * và trên cảm ứng thì không chạm được. 44 là sàn vùng chạm của iOS.
 */
export const EVENT_MIN_W = 44;

/** Phần quãng còn lại của ngày mà giờ nhận/trả được nới thêm khi vẽ (0 = đúng tỉ lệ như web). */
export const MOBILE_DAY_STRETCH = 0.25;

export interface EventBar<T> {
  event: T;
  position: EventBarPosition;
  left: number;
  width: number;
  lane: number;
}

/**
 * Đặt các thanh event của MỘT hàng xe vào toạ độ pixel + tầng.
 *
 * Gộp ba bước (tính vị trí → nới theo sàn → xếp tầng) vào một hàm thuần vì chúng phụ thuộc nhau:
 * việc nới bề rộng là LÝ DO phải xếp tầng theo pixel. Tách ra thì chỗ gọi phải nhớ thứ tự, và
 * quên một bước là các thanh đè lên nhau mà không có gì báo.
 */
export function layoutEventBars<T extends Pick<CalendarEvent, 'startAt' | 'endAt'>>(
  events: readonly T[],
  range: CalendarRange,
  dayWidth: number,
): EventBar<T>[] {
  const trackW = range.dayCount * dayWidth;

  const bars = events
    .map((event) => ({ event, position: computeEventPosition(event, range) }))
    .filter((bar): bar is { event: T; position: EventBarPosition } => bar.position !== null)
    .map(({ event, position }) => {
      /*
       * Thang hiển thị 12 GIỜ cho event ngắn hơn một ngày: thuê 6 tiếng chiếm NỬA ô thay vì 1/4
       * ô — đúng cảm nhận vận hành ("nửa ngày là mất nửa ngày xe"), không phải tỉ lệ thiên văn
       * 24h. Event từ một ngày trở lên vẫn theo tỉ lệ thật để vị trí ngày chính xác.
       */
      /*
       * NỚI theo giờ trong ngày (riêng mobile, người dùng 28/11/2026): ô ngày trên điện thoại hẹp,
       * nên giờ bắt đầu lùi về đầu ngày và giờ kết thúc tiến về cuối ngày thêm `MOBILE_DAY_STRETCH`
       * phần quãng còn lại - trả xe 17h (71%) vẽ tới ~78%, nhận 8h (33%) vẽ từ ~25%. Ngày bắt đầu /
       * kết thúc vẫn đúng ô; chỉ phần trong ngày được nới để thẻ có thêm chỗ cho chữ.
       */
      const startDay = Math.floor(position.offsetDays);
      const startFrac = position.offsetDays - startDay;
      const endAt = position.offsetDays + position.spanDays;
      const endDay = Math.floor(endAt);
      const endFrac = endAt - endDay;
      const visualStart = startDay + startFrac * (1 - MOBILE_DAY_STRETCH);
      const visualEnd = endFrac === 0 ? endAt : endDay + endFrac + (1 - endFrac) * MOBILE_DAY_STRETCH;
      const stretched = Math.max(visualEnd - visualStart, 0);
      const visualSpan =
        position.spanDays < 1 ? Math.min(Math.max(position.spanDays * 2, stretched), 1) : stretched;
      const width = Math.min(
        trackW,
        // Không trừ khe ở đây: thẻ tự thụt `CARD_INSET_X` MỖI bên lúc vẽ - trừ thêm ở đây làm mép
        // phải hở gấp đôi mép trái, đơn trọn ngày trông "không full ô" (người dùng 28/11/2026).
        Math.max(visualSpan * dayWidth, Math.min(EVENT_MIN_W, trackW)),
      );
      // Kẹp trong dải để thanh đã nới không tràn ra ngoài mép phải của hàng.
      const left = Math.max(0, Math.min(visualStart * dayWidth, trackW - width));
      return { event, position, left, width };
    });

  const lanes = assignPixelLanes(bars);
  return bars.map((bar, i) => ({ ...bar, lane: lanes[i] ?? 0 }));
}
