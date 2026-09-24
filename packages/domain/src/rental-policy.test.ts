import { describe, expect, it } from 'vitest';
import { deliveryTierRanges, freeDeliveryWithinKm, isFreeDeliveryFee } from './rental-policy';

/**
 * Bậc phí giao xe — MỘT luật cho mọi nơi đọc nó: dòng tóm tắt khách thấy, form chính sách, màn
 * giao xe của chủ xe và màn duyệt xe của nền tảng.
 */
describe('isFreeDeliveryFee', () => {
  it('rỗng hoặc 0 là miễn phí — dạng số (form) lẫn chuỗi (API)', () => {
    for (const fee of [null, undefined, 0, '0', '0.00', '']) {
      expect(isFreeDeliveryFee(fee)).toBe(true);
    }
  });

  it('có phí thì không miễn phí', () => {
    expect(isFreeDeliveryFee(50000)).toBe(false);
    expect(isFreeDeliveryFee('50000')).toBe(false);
  });
});

describe('deliveryTierRanges', () => {
  it('mốc "từ" suy từ mốc "đến" của bậc trước; bậc đang gõ dở (chưa có mốc) bị bỏ qua', () => {
    expect(
      deliveryTierRanges([
        { toKm: 3, fee: 0 },
        { toKm: null, fee: 20000 },
        { toKm: 10, fee: '50000' },
      ]),
    ).toEqual([
      { fromKm: 0, toKm: 3, fee: '0', free: true },
      { fromKm: 3, toKm: 10, fee: '50000', free: false },
    ]);
  });
});

describe('freeDeliveryWithinKm', () => {
  it('bậc ĐẦU miễn phí ⇒ vùng miễn phí tới mốc của nó', () => {
    expect(
      freeDeliveryWithinKm([
        { toKm: 5, fee: '0' },
        { toKm: 20, fee: '80000' },
      ]),
    ).toBe(5);
  });

  it('bậc miễn phí nằm GIỮA không phải "vùng miễn phí"', () => {
    expect(
      freeDeliveryWithinKm([
        { toKm: 5, fee: 30000 },
        { toKm: 10, fee: 0 },
      ]),
    ).toBeNull();
  });

  it('bậc đầu còn đang gõ dở (chưa có mốc) ⇒ chưa có vùng miễn phí', () => {
    expect(freeDeliveryWithinKm([{ toKm: null, fee: 0 }])).toBeNull();
    expect(freeDeliveryWithinKm([])).toBeNull();
  });
});
