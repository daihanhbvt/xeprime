import { describe, expect, it } from 'vitest';

import { toAppTz } from './datetime';

import type { VehicleBusyDay } from './rental-busy';

import {
  buildBusyDayIndex,
  busyLevelOf,
  busyPeriodsOf,
  EMPTY_BUSY_INDEX,
  firstBusyDayAfter,
  rangeBusyConflict,
} from './rental-busy';

/**
 * Tra cứu lịch bận — thứ quyết định ô nào bị khoá, ô nào chỉ tô cảnh báo, và khi nào "Áp dụng"
 * phải tắt.
 *
 * Sai ở đây có hai kiểu, và kiểu nào cũng tệ: khoá nhầm ngày rảnh (mất đơn), hoặc mở nhầm ngày
 * bận (khách đi hết luồng rồi mới bị từ chối).
 */
const at = (local: string) => `${local}:00.000+07:00`;

const DAYS: VehicleBusyDay[] = [
  {
    date: '2026-09-10',
    fullyBusy: false,
    periods: [{ startAt: at('2026-09-10T08:00'), endAt: at('2026-09-10T12:00') }],
  },
  { date: '2026-09-11', fullyBusy: true, periods: [] },
  {
    date: '2026-09-15',
    fullyBusy: false,
    periods: [
      { startAt: at('2026-09-15T07:00'), endAt: at('2026-09-15T09:00') },
      { startAt: at('2026-09-15T18:00'), endAt: at('2026-09-15T20:00') },
    ],
  },
];

const index = buildBusyDayIndex(DAYS);

/**
 * Mốc tra cứu dựng bằng `toAppTz`, KHÔNG bằng `dayjs` trần.
 *
 * `busyDayKey` đọc MẶT ĐỒNG HỒ của giá trị đưa vào, và giá trị mà sản phẩm đưa vào luôn là
 * giờ `Asia/Ho_Chi_Minh` (ô lịch → `calendarDateToAppWallClock`, khoảng thuê → `toAppTz`).
 * `dayjs('…+07:00')` cho mặt đồng hồ theo GIỜ MÁY: trên máy đặt ở UTC, `2026-09-10 00:00` giờ
 * VN thành `2026-09-09 17:00` và tra nhầm sang ngày hôm trước.
 */
const day = (local: string) => toAppTz(at(local));

describe('phân mức bận của một ngày', () => {
  it('rảnh / bận một phần / bận trọn ngày', () => {
    expect(busyLevelOf(index, day('2026-09-09T00:00'))).toBe('free');
    expect(busyLevelOf(index, day('2026-09-10T00:00'))).toBe('partial');
    expect(busyLevelOf(index, day('2026-09-11T00:00'))).toBe('full');
  });

  it('không có dữ liệu ⇒ mọi ngày đều rảnh, không khoá gì cả', () => {
    expect(busyLevelOf(EMPTY_BUSY_INDEX, day('2026-09-11T00:00'))).toBe('free');
    expect(buildBusyDayIndex(undefined).size).toBe(0);
    expect(buildBusyDayIndex([]).size).toBe(0);
  });

  it('giữ nguyên nhiều quãng bận rời trong cùng một ngày', () => {
    expect(busyPeriodsOf(index, day('2026-09-15T00:00'))).toHaveLength(2);
    expect(busyPeriodsOf(index, day('2026-09-11T00:00'))).toHaveLength(0);
  });
});

describe('ngày bận gần nhất sau ngày nhận', () => {
  it('trả về ngày bận đầu tiên kèm mức của nó', () => {
    const next = firstBusyDayAfter(index, day('2026-09-08T10:00'), 30);
    expect(next?.date.format('YYYY-MM-DD')).toBe('2026-09-10');
    expect(next?.level).toBe('partial');
  });

  it('KHÔNG tính chính ngày nhận — nhận vào ngày bận một phần là hợp lệ', () => {
    const next = firstBusyDayAfter(index, day('2026-09-10T14:00'), 30);
    expect(next?.date.format('YYYY-MM-DD')).toBe('2026-09-11');
    expect(next?.level).toBe('full');
  });

  it('ngoài tầm dò thì coi như chưa biết, không khoá', () => {
    expect(firstBusyDayAfter(index, day('2026-09-08T10:00'), 1)).toBeNull();
    expect(firstBusyDayAfter(EMPTY_BUSY_INDEX, day('2026-09-08T10:00'), 30)).toBeNull();
  });
});

describe('khoảng thuê đụng giờ bận', () => {
  it('chồng lên khung giờ bận ⇒ báo đúng quãng đó', () => {
    const hit = rangeBusyConflict(index, day('2026-09-10T10:00'), day('2026-09-10T18:00'));
    expect(hit?.startAt.format('HH:mm')).toBe('08:00');
  });

  it('nhận NGAY LÚC quãng bận kết thúc là hợp lệ (nửa mở, giống constraint DB)', () => {
    expect(rangeBusyConflict(index, day('2026-09-10T12:00'), day('2026-09-10T20:00'))).toBeNull();
  });

  it('trả NGAY LÚC quãng bận bắt đầu là hợp lệ', () => {
    expect(rangeBusyConflict(index, day('2026-09-10T04:00'), day('2026-09-10T08:00'))).toBeNull();
  });

  it('quãng bận nằm giữa khoảng nhiều ngày vẫn bị bắt', () => {
    const hit = rangeBusyConflict(index, day('2026-09-14T09:00'), day('2026-09-16T09:00'));
    expect(hit?.startAt.format('YYYY-MM-DD HH:mm')).toBe('2026-09-15 07:00');
  });

  it('khe rảnh giữa hai quãng bận trong cùng một ngày vẫn chọn được', () => {
    expect(rangeBusyConflict(index, day('2026-09-15T10:00'), day('2026-09-15T17:00'))).toBeNull();
  });

  it('thiếu một đầu hoặc không có dữ liệu thì không kết luận gì', () => {
    expect(rangeBusyConflict(index, day('2026-09-10T10:00'), null)).toBeNull();
    expect(rangeBusyConflict(index, null, day('2026-09-10T10:00'))).toBeNull();
    expect(
      rangeBusyConflict(EMPTY_BUSY_INDEX, day('2026-09-10T10:00'), day('2026-09-10T18:00')),
    ).toBeNull();
  });
});
