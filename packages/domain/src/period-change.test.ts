import { describe, expect, it } from 'vitest';
import { moneyChangePercent } from './money';
import { countChangePercent } from './period-change';

/**
 * Mũi tên tăng/giảm của thẻ KPI. Thứ phải khoá: "không có gì để so" là `null`, KHÔNG phải 0 — một
 * gian hàng tháng trước chưa có chuyến nào mà thẻ hiện "0%" là nói sai về chính họ.
 */
describe('countChangePercent', () => {
  it('tính phần trăm nguyên so với kỳ trước', () => {
    expect(countChangePercent(12, 10)).toBe(20);
    expect(countChangePercent(5, 10)).toBe(-50);
    expect(countChangePercent(10, 10)).toBe(0);
  });

  it('làm tròn nửa-xa-0, đối xứng hai chiều', () => {
    expect(countChangePercent(201, 200)).toBe(1); // +0,5%
    expect(countChangePercent(199, 200)).toBe(-1); // −0,5%
    // −0,3% làm tròn về 0 dương — `-0` sẽ in thành "-0%".
    expect(Object.is(countChangePercent(997, 1000), 0)).toBe(true);
  });

  it('kỳ trước bằng 0 hoặc không hữu hạn ⇒ null', () => {
    expect(countChangePercent(3, 0)).toBeNull();
    expect(countChangePercent(0, 0)).toBeNull();
    expect(countChangePercent(Number.NaN, 4)).toBeNull();
  });
});

describe('moneyChangePercent', () => {
  it('tính trên chuỗi tiền, kể cả số vượt 2^53 xu', () => {
    expect(moneyChangePercent('1500000', '1000000')).toBe(50);
    expect(moneyChangePercent('90071992547409930', '45035996273704965')).toBe(100);
  });

  it('kỳ trước âm (phí ròng âm vì tài trợ khuyến mãi) — so theo độ lớn', () => {
    expect(moneyChangePercent('-50', '-100')).toBe(50);
    expect(moneyChangePercent('100', '-100')).toBe(200);
  });

  it('kỳ trước bằng 0, rỗng, hoặc chuỗi rác ⇒ null — không ném lỗi giữa lúc render', () => {
    expect(moneyChangePercent('100', '0')).toBeNull();
    expect(moneyChangePercent('100', '0.00')).toBeNull();
    expect(moneyChangePercent(null, '100')).toBeNull();
    expect(moneyChangePercent('abc', '100')).toBeNull();
  });

  it('làm tròn nửa-xa-0', () => {
    expect(moneyChangePercent('1005', '1000')).toBe(1);
    expect(moneyChangePercent('995', '1000')).toBe(-1);
  });
});
