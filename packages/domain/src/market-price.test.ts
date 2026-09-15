import { describe, expect, it } from 'vitest';
import { baselinePriceBand, carSeatBucketOf, roundPriceBand } from './market-price';

describe('carSeatBucketOf', () => {
  it('xếp đúng bốn nhóm của bộ lọc chợ', () => {
    expect(carSeatBucketOf(4)).toBe('4');
    expect(carSeatBucketOf(5)).toBe('5');
    expect(carSeatBucketOf(6)).toBe('5');
    expect(carSeatBucketOf(7)).toBe('7');
    expect(carSeatBucketOf(16)).toBe('8plus');
  });

  it('không biết số chỗ thì nói KHÔNG BIẾT, không đoán bừa một nhóm', () => {
    expect(carSeatBucketOf(null)).toBeNull();
    expect(carSeatBucketOf(undefined)).toBeNull();
    expect(carSeatBucketOf(Number.NaN)).toBeNull();
  });
});

describe('baselinePriceBand', () => {
  it('ô tô: kiểu dáng THẮNG số chỗ — nó là chiều khách thật sự so sánh', () => {
    const bySuv = baselinePriceBand({ vehicleType: 'car', bodyType: 'suv', seatCount: 5 });
    const bySeat = baselinePriceBand({ vehicleType: 'car', seatCount: 5 });
    expect(bySuv.median).not.toBe(bySeat.median);
  });

  it('xe máy: mô tô phân khối lớn KHÔNG rơi vào mức của xe số', () => {
    const underbone = baselinePriceBand({
      vehicleType: 'motorbike',
      motorbikeCategory: 'underbone',
    });
    const touring = baselinePriceBand({ vehicleType: 'motorbike', motorbikeCategory: 'touring' });
    expect(touring.median).toBeGreaterThan(underbone.median * 3);
  });

  it('không khai gì vẫn trả về một khoảng đọc được — ô gợi ý không được rỗng', () => {
    for (const vehicleType of ['car', 'motorbike']) {
      const band = baselinePriceBand({ vehicleType });
      expect(band.low).toBeGreaterThan(0);
      expect(band.median).toBeGreaterThanOrEqual(band.low);
      expect(band.high).toBeGreaterThanOrEqual(band.median);
    }
  });

  it('mọi phân khúc đều giữ thứ tự low ≤ median ≤ high', () => {
    const segments = [
      { vehicleType: 'car', bodyType: 'mini' },
      { vehicleType: 'car', bodyType: 'minibus' },
      { vehicleType: 'car', seatCount: 7 },
      { vehicleType: 'motorbike', motorbikeCategory: 'scooter' },
      { vehicleType: 'motorbike', motorbikeCategory: 'adventure' },
    ];
    for (const segment of segments) {
      const band = baselinePriceBand(segment);
      expect(band.low).toBeLessThanOrEqual(band.median);
      expect(band.median).toBeLessThanOrEqual(band.high);
    }
  });
});

describe('roundPriceBand', () => {
  it('làm tròn về bội của mười nghìn — giá thuê ngoài đời không có số lẻ', () => {
    expect(roundPriceBand({ low: 643_219, median: 747_777, high: 902_401 })).toEqual({
      low: 640_000,
      median: 750_000,
      high: 900_000,
    });
  });

  /*
   * Ba con số sát nhau có thể tròn về CÙNG một mốc, hoặc tệ hơn là tròn ngược thứ tự. Một khoảng
   * "900.000 – 890.000" là thứ không ai đọc được, nên phép làm tròn phải tự giữ thứ tự.
   */
  it('không bao giờ để mức cao tụt xuống dưới mức thấp', () => {
    const band = roundPriceBand({ low: 149_000, median: 148_000, high: 147_000 });
    expect(band.low).toBeLessThanOrEqual(band.median);
    expect(band.median).toBeLessThanOrEqual(band.high);
  });

  it('số rất nhỏ không tròn về 0 — gợi ý "0đ/ngày" là một lời khuyên sai', () => {
    expect(roundPriceBand({ low: 1, median: 2, high: 3 }).low).toBe(10_000);
  });
});
