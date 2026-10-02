import { describe, expect, it } from 'vitest';
import { isUrgentWait, waitingAge } from './waiting-age';

const NOW = Date.parse('2026-10-01T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('waitingAge', () => {
  it('dưới một giờ đếm bằng phút, và không bao giờ ra "0 phút"', () => {
    expect(waitingAge(ago(40 * 60_000), NOW)).toMatchObject({ unit: 'minutes', count: 40 });
    expect(waitingAge(ago(5_000), NOW)).toMatchObject({ unit: 'minutes', count: 1 });
  });

  it('từ một giờ tới dưới một ngày đếm bằng giờ, làm tròn xuống', () => {
    expect(waitingAge(ago(5.9 * 3_600_000), NOW)).toMatchObject({ unit: 'hours', count: 5 });
  });

  it('từ 24 giờ trở lên đếm bằng ngày', () => {
    expect(waitingAge(ago(50 * 3_600_000), NOW)).toMatchObject({ unit: 'days', count: 2 });
  });

  it('mốc tương lai (lệch đồng hồ) quy về 0 thay vì số âm', () => {
    expect(waitingAge(new Date(NOW + 60_000).toISOString(), NOW)).toMatchObject({
      unit: 'minutes',
      totalHours: 0,
    });
  });
});

describe('isUrgentWait', () => {
  it('khẩn khi đã chờ tròn 24 giờ', () => {
    expect(isUrgentWait(waitingAge(ago(23.9 * 3_600_000), NOW))).toBe(false);
    expect(isUrgentWait(waitingAge(ago(24 * 3_600_000), NOW))).toBe(true);
  });
});
