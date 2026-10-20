import { describe, expect, it } from 'vitest';
import { isNewListing } from './listing-flags';

describe('isNewListing', () => {
  it('chưa ai chấm điểm ⇒ xe mới', () => {
    expect(isNewListing({ ratingCount: 0, ratingAvg: '0' })).toBe(true);
    expect(isNewListing({ ratingCount: 0, ratingAvg: null })).toBe(true);
  });

  it('có lượt chấm nhưng thiếu điểm trung bình ⇒ vẫn là xe mới (không hiện "0 sao" giả)', () => {
    expect(isNewListing({ ratingCount: 3, ratingAvg: null })).toBe(true);
    expect(isNewListing({ ratingCount: 3 })).toBe(true);
    expect(isNewListing({ ratingCount: 3, ratingAvg: 'abc' })).toBe(true);
  });

  it('có lượt chấm và điểm đọc được ⇒ không còn là xe mới', () => {
    expect(isNewListing({ ratingCount: 3, ratingAvg: '4.8' })).toBe(false);
  });
});
