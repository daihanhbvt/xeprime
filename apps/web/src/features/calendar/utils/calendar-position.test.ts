import { describe, expect, it } from 'vitest';
import { assignLanes, computeEventPosition } from './calendar-position.util';
import type { CalendarRange } from '../types/calendar.types';

/** 01/07 → 08/07 UTC, 7 ngày. */
const RANGE: CalendarRange = {
  startAt: new Date('2026-07-01T00:00:00.000Z'),
  endAt: new Date('2026-07-08T00:00:00.000Z'),
  dayCount: 7,
};

describe('computeEventPosition', () => {
  it('event nằm gọn trong khoảng', () => {
    const pos = computeEventPosition(
      { startAt: '2026-07-02T00:00:00.000Z', endAt: '2026-07-04T00:00:00.000Z' },
      RANGE,
    );
    expect(pos).toEqual({ offsetDays: 1, spanDays: 2, clippedStart: false, clippedEnd: false });
  });

  it('nửa ngày ra phần thập phân, không làm tròn', () => {
    const pos = computeEventPosition(
      { startAt: '2026-07-02T12:00:00.000Z', endAt: '2026-07-03T06:00:00.000Z' },
      RANGE,
    );
    expect(pos?.offsetDays).toBeCloseTo(1.5);
    expect(pos?.spanDays).toBeCloseTo(0.75);
  });

  it('event bắt đầu trước khoảng thì bị clamp và đánh dấu clippedStart', () => {
    const pos = computeEventPosition(
      { startAt: '2026-06-28T00:00:00.000Z', endAt: '2026-07-03T00:00:00.000Z' },
      RANGE,
    );
    expect(pos).toEqual({ offsetDays: 0, spanDays: 2, clippedStart: true, clippedEnd: false });
  });

  it('event kết thúc sau khoảng thì bị clamp và đánh dấu clippedEnd', () => {
    const pos = computeEventPosition(
      { startAt: '2026-07-06T00:00:00.000Z', endAt: '2026-07-20T00:00:00.000Z' },
      RANGE,
    );
    expect(pos).toEqual({ offsetDays: 5, spanDays: 2, clippedStart: false, clippedEnd: true });
  });

  it('event dài hơn cả khoảng vẫn phủ kín, không biến mất', () => {
    const pos = computeEventPosition(
      { startAt: '2026-06-01T00:00:00.000Z', endAt: '2026-09-01T00:00:00.000Z' },
      RANGE,
    );
    expect(pos).toEqual({ offsetDays: 0, spanDays: 7, clippedStart: true, clippedEnd: true });
  });

  it('nửa mở: event kết thúc đúng lúc khoảng bắt đầu thì không hiện', () => {
    const pos = computeEventPosition(
      { startAt: '2026-06-25T00:00:00.000Z', endAt: '2026-07-01T00:00:00.000Z' },
      RANGE,
    );
    expect(pos).toBeNull();
  });

  it('nửa mở: event bắt đầu đúng lúc khoảng kết thúc thì không hiện', () => {
    const pos = computeEventPosition(
      { startAt: '2026-07-08T00:00:00.000Z', endAt: '2026-07-10T00:00:00.000Z' },
      RANGE,
    );
    expect(pos).toBeNull();
  });

  it('ngày không hợp lệ trả null thay vì NaN lan ra CSS', () => {
    expect(computeEventPosition({ startAt: 'khong-phai-ngay', endAt: 'x' }, RANGE)).toBeNull();
  });
});

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

  it('chạm biên nhau vẫn cùng tầng — trả 10:00, nhận 10:00 là hợp lệ', () => {
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
