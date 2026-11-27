import { describe, expect, it } from 'vitest';
import { assignLanes, assignPixelLanes, computeDaySnap } from './calendar-position.util';
import type { CalendarRange } from '../types/calendar.types';

/** 01/07 → 08/07 UTC, 7 ngày. */
const RANGE: CalendarRange = {
  startAt: new Date('2026-07-01T00:00:00.000Z'),
  endAt: new Date('2026-07-08T00:00:00.000Z'),
  dayCount: 7,
};

describe('assignLanes', () => {
  it('các event không chồng nhau dùng chung một tầng', () => {
    const lanes = assignLanes([
      { startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-07-02T00:00:00.000Z' },
      { startAt: '2026-07-03T00:00:00.000Z', endAt: '2026-07-04T00:00:00.000Z' },
    ]);
    expect(lanes.map((l) => l.lane)).toEqual([0, 0]);
  });

  it('event chồng nhau bị đẩy xuống tầng dưới', () => {
    const lanes = assignLanes([
      { startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-07-05T00:00:00.000Z' },
      { startAt: '2026-07-02T00:00:00.000Z', endAt: '2026-07-03T00:00:00.000Z' },
    ]);
    expect(lanes.map((l) => l.lane)).toEqual([0, 1]);
  });

  it('chạm biên nhau vẫn cùng tầng - trả 10:00, nhận 10:00 là hợp lệ', () => {
    const lanes = assignLanes([
      { startAt: '2026-07-01T10:00:00.000Z', endAt: '2026-07-02T10:00:00.000Z' },
      { startAt: '2026-07-02T10:00:00.000Z', endAt: '2026-07-03T10:00:00.000Z' },
    ]);
    expect(lanes.map((l) => l.lane)).toEqual([0, 0]);
  });

  it('ba event chồng nhau dùng ba tầng', () => {
    const lanes = assignLanes([
      { startAt: '2026-07-01T00:00:00.000Z', endAt: '2026-07-06T00:00:00.000Z' },
      { startAt: '2026-07-02T00:00:00.000Z', endAt: '2026-07-06T00:00:00.000Z' },
      { startAt: '2026-07-03T00:00:00.000Z', endAt: '2026-07-06T00:00:00.000Z' },
    ]);
    expect(lanes.map((l) => l.lane).sort()).toEqual([0, 1, 2]);
  });
});

describe('assignPixelLanes - xếp tầng theo vị trí PIXEL đã nới', () => {
  it('hai thanh rời nhau trên màn hình cùng tầng', () => {
    expect(
      assignPixelLanes([
        { left: 0, width: 46 },
        { left: 60, width: 46 },
      ]),
    ).toEqual([0, 0]);
  });

  it('hai thanh KHÔNG chồng giờ nhưng chồng chỗ (đã nới sàn bề rộng) phải tách tầng', () => {
    // Đơn 2h lúc 8:00 và đơn 2h lúc 11:00 cùng ngày: trên lưới 64px/ngày cả hai bị nới lên
    // 46px và đè nhau — xếp theo giờ sẽ cho cùng tầng, xếp theo pixel thì không.
    expect(
      assignPixelLanes([
        { left: 20, width: 46 },
        { left: 28, width: 46 },
      ]),
    ).toEqual([0, 1]);
  });

  it('lane trả về theo ĐÚNG thứ tự mảng vào, kể cả khi vào không theo left tăng dần', () => {
    expect(
      assignPixelLanes([
        { left: 100, width: 46 },
        { left: 0, width: 46 },
        { left: 110, width: 46 },
      ]),
    ).toEqual([0, 0, 1]);
  });

  it('chạm mép nhau vẫn cùng tầng', () => {
    expect(
      assignPixelLanes([
        { left: 0, width: 46 },
        { left: 46, width: 46 },
      ]),
    ).toEqual([0, 0]);
  });
});

describe('computeDaySnap - thẻ chiếm trọn ô ngày, giờ chỉ quyết mức hở (26/11/2026)', () => {
  const snap = (startAt: string, endAt: string) => computeDaySnap({ startAt, endAt }, RANGE);

  it('hai chuyến CÙNG một ngày (08h-12h và 13h-17h) nằm cùng một ô, không lệch sang ngày kế', () => {
    const morning = snap('2026-07-02T08:00:00.000Z', '2026-07-02T12:00:00.000Z');
    const afternoon = snap('2026-07-02T13:00:00.000Z', '2026-07-02T17:00:00.000Z');
    expect(morning).toMatchObject({ startDay: 1, endDay: 1, startGap: 1, endGap: 2 });
    expect(afternoon).toMatchObject({ startDay: 1, endDay: 1, startGap: 2, endGap: 1 });
  });

  it('mốc nhận: trước 07h khít · 07h-12h hở ít · từ 12h hở nhiều', () => {
    expect(snap('2026-07-02T06:59:00.000Z', '2026-07-04T23:00:00.000Z')?.startGap).toBe(0);
    expect(snap('2026-07-02T07:00:00.000Z', '2026-07-04T23:00:00.000Z')?.startGap).toBe(1);
    expect(snap('2026-07-02T11:59:00.000Z', '2026-07-04T23:00:00.000Z')?.startGap).toBe(1);
    expect(snap('2026-07-02T12:00:00.000Z', '2026-07-04T23:00:00.000Z')?.startGap).toBe(2);
  });

  it('mốc trả: sau 19h khít · 12h-19h hở ít · từ 12h trở về trước hở nhiều', () => {
    expect(snap('2026-07-02T06:00:00.000Z', '2026-07-04T19:30:00.000Z')?.endGap).toBe(0);
    expect(snap('2026-07-02T06:00:00.000Z', '2026-07-04T19:00:00.000Z')?.endGap).toBe(1);
    expect(snap('2026-07-02T06:00:00.000Z', '2026-07-04T17:30:00.000Z')?.endGap).toBe(1);
    expect(snap('2026-07-02T06:00:00.000Z', '2026-07-04T12:30:00.000Z')?.endGap).toBe(1);
    expect(snap('2026-07-02T06:00:00.000Z', '2026-07-04T12:00:00.000Z')?.endGap).toBe(2);
  });

  it('trả đúng 00h hôm sau thuộc ngày hôm trước, khít mép phải', () => {
    expect(snap('2026-07-02T00:00:00.000Z', '2026-07-04T00:00:00.000Z')).toMatchObject({
      startDay: 1,
      endDay: 2,
      startGap: 0,
      endGap: 0,
    });
  });

  it('bị cắt ở mép khoảng xem thì mép đó khít', () => {
    expect(snap('2026-06-29T15:00:00.000Z', '2026-07-09T09:00:00.000Z')).toMatchObject({
      startDay: 0,
      endDay: 6,
      startGap: 0,
      endGap: 0,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it('ngoài khoảng xem hoặc thời gian hỏng thì không vẽ', () => {
    expect(snap('2026-07-09T08:00:00.000Z', '2026-07-10T08:00:00.000Z')).toBeNull();
    expect(snap('x', '2026-07-03T08:00:00.000Z')).toBeNull();
  });
});
