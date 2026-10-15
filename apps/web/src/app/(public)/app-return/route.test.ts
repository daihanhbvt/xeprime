import { describe, expect, it } from 'vitest';
import { nativeTripHref } from '@/features/payment-gateway/native-trip-return';
import { GET } from './route';

/** Điểm quay về công khai cho app native — 302 thẳng sang deep link hợp lệ, không vẽ trang nào. */
const TRIP = '01JTESTXRP0000000000000000';
const ORDER = '01JTESTXRP0RDER00000000000';

function call(query: string) {
  return GET(new Request(`https://xeprime.test/app-return?${query}`));
}

describe('nativeTripHref', () => {
  it('chỉ nhận ULID cho chuyến', () => {
    expect(nativeTripHref(TRIP)).toBe(`xeprime://trips/${TRIP}`);
    expect(nativeTripHref('abc')).toBeNull();
    expect(nativeTripHref(`${TRIP.slice(0, 25)}I`)).toBeNull();
    expect(nativeTripHref('../../evil?x=1&y=00000000000')).toBeNull();
    expect(nativeTripHref(null)).toBeNull();
  });

  it('nối lượt cổng hợp lệ, bỏ lượt hỏng', () => {
    expect(nativeTripHref(TRIP, ORDER)).toBe(`xeprime://trips/${TRIP}?paymentOrder=${ORDER}`);
    expect(nativeTripHref(TRIP, 'x&y=1')).toBe(`xeprime://trips/${TRIP}`);
    expect(nativeTripHref('bad', ORDER)).toBeNull();
  });
});

describe('GET /app-return', () => {
  it('302 sang deep link kèm lượt cổng, không có body', async () => {
    const res = call(`trip=${TRIP}&paymentOrder=${ORDER}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(nativeTripHref(TRIP, ORDER));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('');
  });

  it('link hỏng thì về trang chủ', () => {
    const res = call('trip=bad');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });
});
