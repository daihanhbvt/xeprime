import { describe, expect, it } from 'vitest';
import {
  deliverySummaryText,
  deliveryTierFee,
  deliveryTierRanges,
  freeDeliveryWithinKm,
  isFreeDeliveryFee,
} from './rental-policy';

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
      { fromKm: 0, toKm: 3, fee: '0', perKm: null, free: true },
      { fromKm: 3, toKm: 10, fee: '50000', perKm: null, free: false },
    ]);
  });

  it('bậc THEO KM mang đơn giá, không bao giờ là miễn phí', () => {
    expect(
      deliveryTierRanges([
        { toKm: 5, fee: '0' },
        { toKm: 15, perKm: '10000' },
      ]),
    ).toEqual([
      { fromKm: 0, toKm: 5, fee: '0', perKm: null, free: true },
      { fromKm: 5, toKm: 15, fee: '0', perKm: '10000', free: false },
    ]);
  });
});

describe('deliveryTierFee — phí của một bậc ở một khoảng cách', () => {
  it('bậc trọn gói trả nguyên phí, không phụ thuộc khoảng cách', () => {
    expect(deliveryTierFee({ fee: '100000' }, 7.3)).toBe('100000');
    expect(deliveryTierFee({ fee: '0' }, 2)).toBe('0');
  });

  it('bậc theo km: đơn giá × khoảng cách, làm tròn tới bước 1.000đ', () => {
    expect(deliveryTierFee({ perKm: '10000' }, 12)).toBe('120000');
    // 12,34 km × 10.000 = 123.400 ⇒ 123.000; 12,35 km ⇒ 123.500 ⇒ 124.000 (nửa bước làm tròn LÊN).
    expect(deliveryTierFee({ perKm: '10000' }, 12.34)).toBe('123000');
    expect(deliveryTierFee({ perKm: '10000' }, 12.35)).toBe('124000');
  });

  it('đơn giá rác hoặc khoảng cách âm ⇒ ném, không im lặng cho ra 0', () => {
    expect(() => deliveryTierFee({ perKm: 'abc' }, 3)).toThrow();
    expect(() => deliveryTierFee({ perKm: '10000' }, -1)).toThrow();
  });
});

describe('deliverySummaryText', () => {
  it('bậc theo km đọc ra đơn giá mỗi km', () => {
    const text = deliverySummaryText(
      {
        deliveryTiers: [
          { toKm: 5, fee: 0 },
          { toKm: 15, perKm: '10000' },
        ],
        deliveryMaxRadiusKm: 15,
      },
      { money: (v) => `${v}đ`, free: 'Miễn phí', quote: 'Báo giá', perKm: (m) => `${m}/km` },
    );
    expect(text).toContain('0–5 km: Miễn phí');
    expect(text).toContain('>5–15 km: 10000đ/km');
    expect(text).toContain('>15 km: Báo giá');
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
