import { describe, expect, it } from 'vitest';

import { timeDistance } from './trip-time';

const NOW = Date.parse('2026-10-07T08:00:00.000Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe('timeDistance', () => {
  it('tương lai: đơn vị lớn nhất còn ≥ 1 thắng', () => {
    expect(timeDistance(at(3 * 3_600_000 + 20 * 60_000), NOW)).toMatchObject({
      direction: 'future',
      unit: 'hours',
      count: 3,
    });
    expect(timeDistance(at(2 * 86_400_000), NOW)).toMatchObject({ unit: 'days', count: 2 });
    expect(timeDistance(at(45 * 60_000), NOW)).toMatchObject({ unit: 'minutes', count: 45 });
  });

  it('quá khứ: cùng thang, chiều "past", remainingMs âm', () => {
    const past = timeDistance(at(-2 * 3_600_000 - 5 * 60_000), NOW);
    expect(past).toMatchObject({ direction: 'past', unit: 'hours', count: 2 });
    expect(past.remainingMs).toBeLessThan(0);
  });

  it('dưới một phút không ra "0 phút"', () => {
    expect(timeDistance(at(20_000), NOW)).toMatchObject({ unit: 'minutes', count: 1 });
    expect(timeDistance(at(-20_000), NOW)).toMatchObject({
      direction: 'past',
      unit: 'minutes',
      count: 1,
    });
  });
});
