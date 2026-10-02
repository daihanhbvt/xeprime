import { assignPixelLanes, computeEventPosition, layoutEventBars } from './calendar-position.util';
import { buildRange } from './calendar-date.util';

/** 3 ngày từ 12/07/2026, giờ VN — cùng khoảng mà lưới 3 ngày của app dựng. */
const range = buildRange('2026-07-12', 3);
/** 00:00 giờ VN ngày 12/07 = 17:00 UTC ngày 11/07 (UTC+7, không DST). */
const DAY0 = '2026-07-11T17:00:00.000Z';

describe('computeEventPosition', () => {
  it('đặt event bắt đầu đúng đầu khoảng ở offset 0', () => {
    const position = computeEventPosition({ startAt: DAY0, endAt: '2026-07-12T17:00:00.000Z' }, range);

    expect(position).toEqual({
      offsetDays: 0,
      spanDays: 1,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it('CLAMP vào biên thay vì bỏ event chạy dài hơn khoảng đang xem', () => {
    // Một đơn ba tuần bắt đầu trước và kết thúc sau khoảng: vẫn phải vẽ suốt cả ba ngày.
    const position = computeEventPosition(
      { startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-07-25T00:00:00.000Z' },
      range,
    );

    expect(position).toEqual({
      offsetDays: 0,
      spanDays: 3,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it('bỏ event kết thúc ĐÚNG lúc khoảng bắt đầu — biên nửa mở [start, end) như ADR 0006', () => {
    expect(
      computeEventPosition({ startAt: '2026-07-10T00:00:00.000Z', endAt: DAY0 }, range),
    ).toBeNull();
  });

  it('bỏ event bắt đầu đúng lúc khoảng kết thúc', () => {
    const endOfRange = range.endAt.toISOString();
    expect(
      computeEventPosition({ startAt: endOfRange, endAt: '2026-07-20T00:00:00.000Z' }, range),
    ).toBeNull();
  });

  it('trả null cho mốc không đọc được thay vì đẩy NaN vào phép định vị', () => {
    expect(computeEventPosition({ startAt: 'không-phải-ngày', endAt: DAY0 }, range)).toBeNull();
  });

  it('tính offset theo giờ VN — event 12:00 trưa nằm ở NỬA ngày, không lệch 7 tiếng', () => {
    const position = computeEventPosition(
      { startAt: '2026-07-12T05:00:00.000Z', endAt: '2026-07-12T17:00:00.000Z' },
      range,
    );

    // 05:00 UTC = 12:00 VN ⇒ đúng 0,5 ngày kể từ đầu khoảng.
    expect(position?.offsetDays).toBeCloseTo(0.5);
    expect(position?.spanDays).toBeCloseTo(0.5);
  });
});

describe('assignPixelLanes', () => {
  it('giữ hai thanh chồng CHỖ ở hai tầng khác nhau', () => {
    expect(assignPixelLanes([{ left: 0, width: 50 }, { left: 20, width: 50 }])).toEqual([0, 1]);
  });

  it('dùng lại tầng 0 khi thanh sau bắt đầu từ chỗ thanh trước kết thúc', () => {
    expect(assignPixelLanes([{ left: 0, width: 50 }, { left: 50, width: 50 }])).toEqual([0, 0]);
  });

  it('trả lane theo ĐÚNG thứ tự mảng vào, không theo thứ tự đã sắp', () => {
    // Vào theo thứ tự ngược: phần tử thứ nhất nằm sau về vị trí nên phải rơi xuống tầng 1.
    expect(assignPixelLanes([{ left: 30, width: 50 }, { left: 0, width: 50 }])).toEqual([1, 0]);
  });

  it('không sinh tầng thứ ba khi chỉ hai thanh chồng nhau đôi một liên tiếp', () => {
    const lanes = assignPixelLanes([
      { left: 0, width: 40 },
      { left: 20, width: 40 },
      { left: 60, width: 40 },
    ]);
    expect(lanes).toEqual([0, 1, 0]);
  });
});

describe('layoutEventBars', () => {
  const dayWidth = 60;

  it('nới thanh ngắn lên SÀN bề rộng để còn chạm được', () => {
    // Đơn một tiếng: theo tỉ lệ thật chỉ ~5px, không đọc và không chạm được.
    const [bar] = layoutEventBars(
      [{ id: 'e1', startAt: DAY0, endAt: '2026-07-11T18:00:00.000Z' }],
      range,
      dayWidth,
    );

    expect(bar!.width).toBeGreaterThanOrEqual(44);
  });

  it('dùng thang 12 GIỜ cho event ngắn hơn một ngày — thuê 6 tiếng chiếm NỬA ô', () => {
    /*
     * Ô rộng để thang hiển thị lộ ra: ở `dayWidth` hẹp thì SÀN 44px thắng và cả hai thang cho
     * cùng một con số, nên phép so sánh không nói lên điều gì.
     */
    const wideDay = 120;
    const [bar] = layoutEventBars(
      [{ id: 'e1', startAt: DAY0, endAt: '2026-07-11T23:00:00.000Z' }],
      range,
      wideDay,
    );

    // 6 tiếng = 0,25 ngày. Thang 12h nhân đôi thành 0,5 ô = 60px (trừ 2px viền) — KHÔNG phải
    // 0,25 ô = 28px của tỉ lệ thiên văn 24h.
    expect(bar!.width).toBe(58);
  });

  it('giữ tỉ lệ THẬT cho event từ một ngày trở lên', () => {
    const [bar] = layoutEventBars(
      [{ id: 'e1', startAt: DAY0, endAt: '2026-07-13T17:00:00.000Z' }],
      range,
      dayWidth,
    );

    expect(bar!.width).toBe(2 * dayWidth - 2);
  });

  it('kẹp thanh đã nới vào trong dải, không để tràn mép phải', () => {
    // Event một tiếng ở cuối ngày cuối: sàn 44px sẽ đẩy nó vượt mép nếu không kẹp.
    const [bar] = layoutEventBars(
      [{ id: 'e1', startAt: '2026-07-14T16:00:00.000Z', endAt: '2026-07-14T16:59:00.000Z' }],
      range,
      dayWidth,
    );

    expect(bar!.left + bar!.width).toBeLessThanOrEqual(range.dayCount * dayWidth);
  });

  it('xếp tầng theo PIXEL: hai event không chồng GIỜ vẫn tách tầng khi chồng CHỖ sau khi nới', () => {
    const bars = layoutEventBars(
      [
        { id: 'a', startAt: DAY0, endAt: '2026-07-11T18:00:00.000Z' },
        { id: 'b', startAt: '2026-07-11T18:00:00.000Z', endAt: '2026-07-11T19:00:00.000Z' },
      ],
      range,
      dayWidth,
    );

    expect(bars.map((bar) => bar.lane)).toEqual([0, 1]);
  });

  it('bỏ event nằm ngoài khoảng thay vì vẽ một thanh rỗng', () => {
    expect(
      layoutEventBars(
        [{ id: 'x', startAt: '2026-06-01T00:00:00.000Z', endAt: '2026-06-02T00:00:00.000Z' }],
        range,
        dayWidth,
      ),
    ).toEqual([]);
  });
});
