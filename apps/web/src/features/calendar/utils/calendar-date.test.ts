import { beforeAll, describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { buildRange, listDays, formatDateTime, rentalDays, DISPLAY_TIMEZONE } from './calendar-date.util';

beforeAll(() => {
  dayjs.extend(utc);
  dayjs.extend(timezone);
});

describe('buildRange', () => {
  /**
   * Đây là test quan trọng nhất của file: ranh giới ngày phải tính theo giờ VN.
   * Nếu ai đó sửa thành `dayjs(from).startOf('day')` (giờ máy), test này đỏ.
   */
  it('ngày bắt đầu là 00:00 giờ VN, tức 17:00 UTC hôm trước', () => {
    const range = buildRange('2026-07-12', 7);
    expect(range.startAt.toISOString()).toBe('2026-07-11T17:00:00.000Z');
  });

  it('khoảng nửa mở: 7 ngày kết thúc đúng 00:00 giờ VN ngày thứ 8', () => {
    const range = buildRange('2026-07-12', 7);
    expect(range.endAt.toISOString()).toBe('2026-07-18T17:00:00.000Z');
    expect(range.dayCount).toBe(7);
  });

  it('độ dài khoảng đúng bằng số ngày', () => {
    const range = buildRange('2026-07-01', 30);
    const days = (range.endAt.getTime() - range.startAt.getTime()) / 86_400_000;
    expect(days).toBe(30);
  });
});

describe('listDays', () => {
  it('sinh đúng số cột và nhãn thứ', () => {
    const days = listDays(buildRange('2026-07-12', 7));
    expect(days).toHaveLength(7);
    expect(days[0]?.dayOfMonth).toBe(12);
    expect(days[6]?.dayOfMonth).toBe(18);
  });

  it('đánh dấu cuối tuần', () => {
    // 12/07/2026 là Chủ nhật.
    const days = listDays(buildRange('2026-07-12', 7));
    expect(days[0]?.isWeekend).toBe(true);
    expect(days[1]?.isWeekend).toBe(false);
    expect(days[6]?.isWeekend).toBe(true);
  });
});

describe('formatDateTime', () => {
  it('hiển thị UTC theo giờ Việt Nam (+7)', () => {
    expect(formatDateTime('2026-07-12T03:00:00.000Z')).toBe('10:00 12/07/2026');
  });

  it('mốc UTC buổi tối rơi sang ngày hôm sau ở VN', () => {
    expect(formatDateTime('2026-07-12T18:30:00.000Z')).toBe('01:30 13/07/2026');
  });
});

describe('rentalDays', () => {
  it('đúng 24 tiếng là 1 ngày', () => {
    expect(rentalDays('2026-07-12T03:00:00.000Z', '2026-07-13T03:00:00.000Z')).toBe(1);
  });

  it('25 tiếng tính thành 2 ngày — làm tròn lên', () => {
    expect(rentalDays('2026-07-12T03:00:00.000Z', '2026-07-13T04:00:00.000Z')).toBe(2);
  });

  it('thuê vài tiếng vẫn tính tối thiểu 1 ngày', () => {
    expect(rentalDays('2026-07-12T03:00:00.000Z', '2026-07-12T06:00:00.000Z')).toBe(1);
  });
});

describe('DISPLAY_TIMEZONE', () => {
  it('dùng tên vùng Việt Nam, không phải Asia/Bangkok của tài liệu cũ', () => {
    expect(DISPLAY_TIMEZONE).toBe('Asia/Ho_Chi_Minh');
  });
});
