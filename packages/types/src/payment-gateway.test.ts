import { describe, expect, it } from 'vitest';
import { buildNativeTripReturnUrl, parseNativeTripReturn } from './payment-gateway';
import { isUlid } from './ulid';

const TRIP = '01J9Z3K4M5N6P7Q8R9S0T1V2W3';
const ORDER = '01J9Z3K4M5N6P7Q8R9S0T1V2W4';

describe('isUlid', () => {
  it('nhận đúng 26 ký tự Crockford, từ chối phần còn lại', () => {
    expect(isUlid(TRIP)).toBe(true);
    expect(isUlid(TRIP.toLowerCase())).toBe(false);
    expect(isUlid(`${TRIP}X`)).toBe(false);
    expect(isUlid('01J9Z3K4M5N6P7Q8R9S0T1V2WI')).toBe(false); // I không thuộc bảng chữ
    expect(isUlid(null)).toBe(false);
  });
});

describe('buildNativeTripReturnUrl', () => {
  it('giữ đúng tiền tố mà bản app cũ chờ, nối lượt cổng khi có', () => {
    expect(buildNativeTripReturnUrl('xeprime', TRIP)).toBe(`xeprime://trips/${TRIP}`);
    expect(buildNativeTripReturnUrl('xeprime', TRIP, null)).toBe(`xeprime://trips/${TRIP}`);
    expect(buildNativeTripReturnUrl('xeprime', TRIP, ORDER)).toBe(
      `xeprime://trips/${TRIP}?paymentOrder=${ORDER}`,
    );
  });

  it('mã hoá id lạ thay vì ghép thô vào URL', () => {
    expect(buildNativeTripReturnUrl('xeprime', 'a b/c')).toBe('xeprime://trips/a%20b%2Fc');
  });
});

describe('parseNativeTripReturn', () => {
  it('đọc lại đúng link do builder dựng, có hoặc không scheme', () => {
    const url = buildNativeTripReturnUrl('xeprime', TRIP, ORDER);
    expect(parseNativeTripReturn(url)).toEqual({ tripId: TRIP, orderId: ORDER });
    expect(parseNativeTripReturn(`/trips/${TRIP}?x=1&paymentOrder=${ORDER}&y=2`)).toEqual({
      tripId: TRIP,
      orderId: ORDER,
    });
  });

  it('link chuyến thường hay id không phải ULID ⇒ null', () => {
    expect(parseNativeTripReturn(`xeprime://trips/${TRIP}`)).toBeNull();
    expect(parseNativeTripReturn(`xeprime://trips/abc?paymentOrder=${ORDER}`)).toBeNull();
    expect(parseNativeTripReturn(`xeprime://trips/${TRIP}?paymentOrder=nope`)).toBeNull();
  });
});
