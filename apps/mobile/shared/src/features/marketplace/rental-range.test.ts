import {
  buildBusyDayIndex,
  dayjs,
  firstBusyDayAfter,
  rentalDurationParts,
  type BusyDayIndex,
  type Dayjs,
} from '@xeprime/domain';

/**
 * Canh hai công thức của hộp chọn khoảng thuê, port từ `RentalRangePanel.tsx` của web.
 *
 * Chúng không nằm trong `@xeprime/domain` được vì web cũng để chúng trong component; test này
 * là thứ duy nhất giữ hai bản không trôi khỏi nhau. Sai ở đây là số ngày tính tiền lệch với
 * `PricingService` — khách thấy một con số, hoá đơn ra con số khác.
 */

/** Số ngày TÍNH TIỀN — trùng công thức `PricingService.chargedDays`. */
const chargedDays = (a: Dayjs, b: Dayjs) => Math.max(1, Math.ceil(b.diff(a, 'minute') / 1440));

/** Thời lượng thuê giờ hợp lệ 1–24h, ngoài dải thì rơi về mặc định 4h. */
const DEFAULT_HOURLY_DURATION = 4;
const hourlyDurationOf = (pickupAt: Dayjs | null, returnAt: Dayjs | null) => {
  if (!pickupAt || !returnAt) return DEFAULT_HOURLY_DURATION;
  const h = Math.round(returnAt.diff(pickupAt, 'minute') / 60);
  return h >= 1 && h <= 24 ? h : DEFAULT_HOURLY_DURATION;
};

describe('chargedDays', () => {
  it('đúng 3 ngày cho 26/08 10:00 → 29/08 10:00', () => {
    const a = dayjs('2026-08-26T10:00:00+07:00');
    const b = dayjs('2026-08-29T10:00:00+07:00');
    expect(chargedDays(a, b)).toBe(3);
  });

  it('làm tròn LÊN — quá một phút cũng tính thêm một ngày', () => {
    const a = dayjs('2026-08-26T10:00:00+07:00');
    expect(chargedDays(a, dayjs('2026-08-29T10:01:00+07:00'))).toBe(4);
  });

  it('sàn là 1 ngày, kể cả khi thuê vài giờ', () => {
    const a = dayjs('2026-08-26T10:00:00+07:00');
    expect(chargedDays(a, dayjs('2026-08-26T14:00:00+07:00'))).toBe(1);
  });
});

/**
 * `chargedDays` (tính tiền) và `rentalDurationParts` (thời lượng thật) là HAI công thức, và
 * app từng in nhầm cái đầu vào dòng "Thời gian thuê" — khách thuê 2 ngày 15 giờ mà màn hình nói
 * 3 ngày.
 */
describe('thời lượng hiển thị KHÁC số ngày tính tiền', () => {
  const from = dayjs('2026-08-25T01:30:00+07:00');
  const to = dayjs('2026-08-27T16:00:00+07:00');

  it('62,5 giờ → tính tiền 3 ngày', () => {
    expect(chargedDays(from, to)).toBe(3);
  });

  it('62,5 giờ → thời lượng là 2 ngày 15 giờ', () => {
    expect(rentalDurationParts(from, to)).toEqual({ days: 2, hours: 15 });
  });

  it('thuê vài giờ thì không có phần ngày', () => {
    const start = dayjs('2026-08-26T10:00:00+07:00');
    expect(rentalDurationParts(start, start.add(4, 'hour'))).toEqual({ days: 0, hours: 4 });
  });
});

describe('hourlyDuration', () => {
  it('đọc ra đúng số giờ đang chọn', () => {
    const a = dayjs('2026-08-26T10:00:00+07:00');
    expect(hourlyDurationOf(a, a.add(4, 'hour'))).toBe(4);
    expect(hourlyDurationOf(a, a.add(24, 'hour'))).toBe(24);
  });

  it('ngoài dải 1–24h thì rơi về mặc định — tab giờ không hiển thị một lựa chọn không có', () => {
    const a = dayjs('2026-08-26T10:00:00+07:00');
    expect(hourlyDurationOf(a, a.add(25, 'hour'))).toBe(DEFAULT_HOURLY_DURATION);
    expect(hourlyDurationOf(a, a)).toBe(DEFAULT_HOURLY_DURATION);
    expect(hourlyDurationOf(null, null)).toBe(DEFAULT_HOURLY_DURATION);
  });
});

/**
 * TRẦN NGÀY TRẢ — luật của `RentalRangeSheet`, port nguyên từ `RentalRangePanel.tsx` của web.
 *
 * Hai đầu khoảng rảnh KHÔNG có nghĩa là cả khoảng rảnh: 21→27/08 mà 25/08 bận trọn là bất khả thi,
 * và exclusion constraint ở DB sẽ từ chối (ADR 0006). Lịch phải khoá TRƯỚC, không để người dùng
 * dựng xong một dải rồi mới báo lỗi.
 */
const returnCeilingOf = (busy: BusyDayIndex, pickupAt: Dayjs | null, returnAt: Dayjs | null) => {
  if (!pickupAt || returnAt) return null;
  const next = firstBusyDayAfter(busy, pickupAt, 366);
  if (!next) return null;
  return next.level === 'full' ? next.date : next.date.add(1, 'day');
};

function busyIndex(days: { date: string; fullyBusy: boolean; periods?: { startAt: string; endAt: string }[] }[]): BusyDayIndex {
  return buildBusyDayIndex(
    days.map((d) => ({ date: d.date, fullyBusy: d.fullyBusy, periods: d.periods ?? [] })),
  );
}

describe('trần ngày trả theo lịch bận', () => {
  const pickup = dayjs('2026-08-21T10:00:00+07:00');

  it('không có ngày bận nào ⇒ không có trần', () => {
    expect(returnCeilingOf(busyIndex([]), pickup, null)).toBeNull();
  });

  /** Bận TRỌN ngày 25 ⇒ chính ngày 25 là trần: mọi ngày từ đó trở đi không chọn làm ngày trả được. */
  it('ngày bận TRỌN chặn từ chính ngày đó', () => {
    const busy = busyIndex([{ date: '2026-08-25', fullyBusy: true }]);
    expect(returnCeilingOf(busy, pickup, null)?.format('YYYY-MM-DD')).toBe('2026-08-25');
  });

  /** Bận MỘT PHẦN vẫn trả được trong ngày đó (trả trước giờ bận) ⇒ trần lùi thêm một ngày. */
  it('ngày bận MỘT PHẦN vẫn được là ngày trả', () => {
    const busy = busyIndex([
      {
        date: '2026-08-25',
        fullyBusy: false,
        periods: [{ startAt: '2026-08-25T14:00:00+07:00', endAt: '2026-08-25T18:00:00+07:00' }],
      },
    ]);
    expect(returnCeilingOf(busy, pickup, null)?.format('YYYY-MM-DD')).toBe('2026-08-26');
  });

  it('đã chọn đủ hai đầu thì không còn trần nào để áp', () => {
    const busy = busyIndex([{ date: '2026-08-25', fullyBusy: true }]);
    expect(returnCeilingOf(busy, pickup, dayjs('2026-08-23T10:00:00+07:00'))).toBeNull();
  });
});
