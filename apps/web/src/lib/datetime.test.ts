import { describe, expect, it } from 'vitest';

import {
  dayjs,
  formatRentalDuration,
  formatRentalPoint,
  formatShortDateTimeRange,
  weekdayShort,
} from './datetime';

/**
 * Định dạng mốc/thời lượng thuê xe — dùng chung ở ô chọn thời gian, hộp lịch và overlay yêu cầu
 * thuê. Trước đây mỗi chỗ tự viết một bản; test này khoá đúng một cách hiển thị.
 */
describe('weekdayShort', () => {
  it('CN cho chủ nhật, T2–T7 cho các ngày còn lại', () => {
    // 2026-08-09 là Chủ nhật.
    const sunday = dayjs('2026-08-09T10:00:00');
    expect(weekdayShort(sunday)).toBe('CN');
    expect(weekdayShort(sunday.add(1, 'day'))).toBe('T2');
    expect(weekdayShort(sunday.add(5, 'day'))).toBe('T6');
    expect(weekdayShort(sunday.add(6, 'day'))).toBe('T7');
  });
});

describe('formatRentalPoint', () => {
  it('có THỨ, ngày/tháng và giờ — KHÔNG có năm', () => {
    // 2026-08-08 là thứ Bảy.
    expect(formatRentalPoint(dayjs('2026-08-08T10:00:00'))).toBe('T7, 08/08 · 10:00');
  });

  it('bỏ giờ khi nơi gọi không cần', () => {
    expect(formatRentalPoint(dayjs('2026-08-09T10:00:00'), { withTime: false })).toBe('CN, 09/08');
  });

  it('khoảng xuyên năm vẫn đọc đúng nhờ ngày/tháng', () => {
    expect(formatRentalPoint(dayjs('2026-12-31T22:00:00'))).toContain('31/12');
    expect(formatRentalPoint(dayjs('2027-01-01T08:00:00'))).toContain('01/01');
  });
});

describe('formatShortDateTimeRange', () => {
  it('hiện giờ và ngày/tháng, không hiện năm', () => {
    expect(formatShortDateTimeRange('2026-08-17T01:00:00.000Z', '2026-08-18T07:30:00.000Z')).toBe(
      '08:00 · 17/08 → 14:30 · 18/08',
    );
  });
});

describe('formatRentalDuration', () => {
  const at = (iso: string) => dayjs(iso);

  it('tròn ngày', () => {
    expect(formatRentalDuration(at('2026-08-08T10:00:00'), at('2026-08-10T10:00:00'))).toBe(
      '2 ngày',
    );
  });

  it('ngày lẻ giờ', () => {
    expect(formatRentalDuration(at('2026-08-08T10:00:00'), at('2026-08-10T13:00:00'))).toBe(
      '2 ngày 3 giờ',
    );
  });

  it('dưới một ngày đếm theo giờ', () => {
    expect(formatRentalDuration(at('2026-08-08T10:00:00'), at('2026-08-08T15:00:00'))).toBe(
      '5 giờ',
    );
  });

  it('23h59 KHÔNG thành "0 ngày" — làm tròn theo phút', () => {
    expect(formatRentalDuration(at('2026-08-08T10:00:00'), at('2026-08-09T09:59:00'))).toBe(
      '24 giờ',
    );
  });

  it('khoảng rỗng/âm vẫn ra ít nhất 1 giờ, không ra số âm', () => {
    expect(formatRentalDuration(at('2026-08-08T10:00:00'), at('2026-08-08T10:00:00'))).toBe(
      '1 giờ',
    );
    expect(formatRentalDuration(at('2026-08-08T10:00:00'), at('2026-08-08T08:00:00'))).toBe(
      '1 giờ',
    );
  });
});
