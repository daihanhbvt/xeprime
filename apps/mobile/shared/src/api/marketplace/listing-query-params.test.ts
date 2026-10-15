import { LISTING_AMENITY_VALUES } from '@xeprime/types';
import { toListingQueryParams } from './api';

/**
 * Toggle tiện ích → query param: `1` khi bật, `null` khi tắt — ĐỦ bộ `LISTING_AMENITY`, gồm
 * `vatInvoice` (ADR 0059). Thiếu một khoá ở đây là một bộ lọc bấm được mà backend không nhận.
 */
describe('toListingQueryParams — tiện ích', () => {
  it('mọi tiện ích bật → `1`', () => {
    const params = toListingQueryParams(
      Object.fromEntries(LISTING_AMENITY_VALUES.map((key) => [key, true])),
    );
    for (const key of LISTING_AMENITY_VALUES) expect(params[key]).toBe('1');
  });

  it('tắt / vắng → `null`', () => {
    const params = toListingQueryParams({ vatInvoice: false });
    for (const key of LISTING_AMENITY_VALUES) expect(params[key]).toBeNull();
  });
});
