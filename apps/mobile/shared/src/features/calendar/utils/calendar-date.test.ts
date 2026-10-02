import { buildRange, firstDayOf, lastDayOf, listDays, shiftFrom } from './calendar-date.util';

/**
 * Múi giờ của MÁY CHẠY TEST không được ảnh hưởng kết quả.
 *
 * Đây là điểm chính của cả file: lưới lịch tính biên ngày theo giờ Việt Nam, nên một máy đang ở
 * UTC (CI) và một máy đang ở UTC+7 (máy dev) phải cho ra CÙNG một khoảng. Bản đầu tiên của lưới
 * dùng `startOf('day')` theo giờ máy và lệch đúng 7 tiếng trên CI — event hiện sai cột.
 */
describe('buildRange', () => {
  it('dựng biên ngày theo giờ Việt Nam, không theo giờ máy', () => {
    const range = buildRange('2026-07-12', 3);

    // 00:00 giờ VN ngày 12/07 = 17:00 UTC ngày 11/07.
    expect(range.startAt.toISOString()).toBe('2026-07-11T17:00:00.000Z');
    expect(range.endAt.toISOString()).toBe('2026-07-14T17:00:00.000Z');
    expect(range.dayCount).toBe(3);
  });

  it('khoảng là NỬA MỞ: endAt là 00:00 của ngày SAU ngày cuối', () => {
    const range = buildRange('2026-07-12', 1);
    expect(range.endAt.toISOString()).toBe('2026-07-12T17:00:00.000Z');
  });

  it('vắt qua biên tháng mà không nhảy ngày', () => {
    const range = buildRange('2026-07-31', 2);
    expect(lastDayOf(range)).toBe('2026-08-01');
  });
});

describe('listDays', () => {
  it('sinh đúng số cột, liên tiếp, khoá theo ngày VN', () => {
    const days = listDays(buildRange('2026-07-12', 3));

    expect(days.map((day) => day.key)).toEqual(['2026-07-12', '2026-07-13', '2026-07-14']);
    expect(days.map((day) => day.dayOfMonth)).toEqual([12, 13, 14]);
  });

  it('đánh dấu cuối tuần đúng — 12/07/2026 là Chủ nhật, 13/07 là Thứ hai', () => {
    const days = listDays(buildRange('2026-07-12', 3));
    expect(days.map((day) => day.isWeekend)).toEqual([true, false, false]);
  });

  it('đánh dấu thứ bảy là cuối tuần', () => {
    const [saturday] = listDays(buildRange('2026-07-11', 1));
    expect(saturday!.isWeekend).toBe(true);
  });

  it('chỉ MỘT cột được đánh dấu hôm nay', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T03:00:00.000Z'));
    try {
      const days = listDays(buildRange('2026-07-12', 3));
      expect(days.filter((day) => day.isToday).map((day) => day.key)).toEqual(['2026-07-13']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('nhận diện "hôm nay" theo giờ VN — 22:00 UTC vẫn là NGÀY HÔM SAU ở Việt Nam', () => {
    // 2026-07-12T22:00Z = 2026-07-13 05:00 giờ VN.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-12T22:00:00.000Z'));
    try {
      const days = listDays(buildRange('2026-07-12', 3));
      expect(days.filter((day) => day.isToday).map((day) => day.key)).toEqual(['2026-07-13']);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('shiftFrom', () => {
  it('lùi và tiến đúng một TRANG bằng số ngày đang xem', () => {
    expect(shiftFrom('2026-07-12', 7, 1)).toBe('2026-07-19');
    expect(shiftFrom('2026-07-12', 7, -1)).toBe('2026-07-05');
  });

  it('vắt qua biên tháng và biên năm', () => {
    expect(shiftFrom('2026-12-28', 7, 1)).toBe('2027-01-04');
    expect(shiftFrom('2027-01-02', 7, -1)).toBe('2026-12-26');
  });
});

describe('firstDayOf / lastDayOf', () => {
  it('lastDayOf là ngày CUỐI CÙNG (inclusive), không phải biên nửa mở', () => {
    const range = buildRange('2026-07-12', 3);
    expect(firstDayOf(range)).toBe('2026-07-12');
    expect(lastDayOf(range)).toBe('2026-07-14');
  });

  it('khoảng một ngày có first = last', () => {
    const range = buildRange('2026-07-12', 1);
    expect(firstDayOf(range)).toBe(lastDayOf(range));
  });
});
