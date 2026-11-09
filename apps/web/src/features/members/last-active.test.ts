import { describe, expect, it } from 'vitest';
import { describeLastActive } from './last-active';

const NOW = Date.parse('2026-11-09T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe('describeLastActive', () => {
  it('chưa có mốc nào là "chưa đăng nhập"', () => {
    expect(describeLastActive(null, NOW)).toEqual({ kind: 'never' });
    expect(describeLastActive('không phải ngày', NOW)).toEqual({ kind: 'never' });
  });

  it('trong 5 phút là đang trực tuyến — kể cả khi đồng hồ máy khách chậm hơn server', () => {
    expect(describeLastActive(ago(4 * MIN), NOW)).toEqual({ kind: 'online' });
    expect(describeLastActive(new Date(NOW + 30_000).toISOString(), NOW)).toEqual({
      kind: 'online',
    });
  });

  it('phút, giờ, ngày rồi tới NGÀY CỤ THỂ sau 7 ngày', () => {
    expect(describeLastActive(ago(12 * MIN), NOW)).toEqual({ kind: 'minutes', count: 12 });
    expect(describeLastActive(ago(2 * 60 * MIN), NOW)).toEqual({ kind: 'hours', count: 2 });
    expect(describeLastActive(ago(3 * 24 * 60 * MIN), NOW)).toEqual({ kind: 'days', count: 3 });
    const old = ago(10 * 24 * 60 * MIN);
    expect(describeLastActive(old, NOW)).toEqual({ kind: 'date', iso: old });
  });
});
