import { describe, expect, it } from 'vitest';
import {
  INSURED_VALUE_DEVIATION_WARN_PERCENT,
  insuredValueDeviationPercent,
  insuredValueDeviationWarns,
} from './vehicle-insurance-review';

describe('insuredValueDeviationPercent', () => {
  it('khai cao hơn ⇒ dương, khai thấp hơn ⇒ âm, làm tròn 1 chữ số', () => {
    expect(insuredValueDeviationPercent('600000000', '500000000')).toBe(20);
    expect(insuredValueDeviationPercent('400000000', '500000000')).toBe(-20);
    expect(insuredValueDeviationPercent('512345678', '500000000')).toBe(2.4);
  });

  it('nhận chuỗi Decimal có phần lẻ (`…00.00`)', () => {
    expect(insuredValueDeviationPercent('550000000.00', '500000000')).toBe(10);
  });

  it('thiếu số, sai dạng hoặc giá tham khảo không dương ⇒ null', () => {
    expect(insuredValueDeviationPercent(null, '500000000')).toBeNull();
    expect(insuredValueDeviationPercent('500000000', null)).toBeNull();
    expect(insuredValueDeviationPercent('500000000', '0')).toBeNull();
    expect(insuredValueDeviationPercent('abc', '500000000')).toBeNull();
  });
});

describe('insuredValueDeviationWarns', () => {
  it(`chỉ cảnh báo khi lệch QUÁ ${INSURED_VALUE_DEVIATION_WARN_PERCENT}% (cả hai chiều)`, () => {
    expect(insuredValueDeviationWarns(20)).toBe(false);
    expect(insuredValueDeviationWarns(-20)).toBe(false);
    expect(insuredValueDeviationWarns(20.1)).toBe(true);
    expect(insuredValueDeviationWarns(-35)).toBe(true);
    expect(insuredValueDeviationWarns(null)).toBe(false);
  });
});
