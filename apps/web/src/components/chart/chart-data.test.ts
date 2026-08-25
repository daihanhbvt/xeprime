import { describe, expect, it } from 'vitest';
import { toChartValue } from './chart-data';

/**
 * Ranh giới CHUỖI → SỐ duy nhất của tuyến biểu đồ.
 *
 * Test này tồn tại vì đây là chỗ ADR 0007 bị bẻ có chủ đích: mọi nơi khác tiền là chuỗi, riêng
 * recharts phải nhận `number` để đặt chiều cao cột. Nếu phép quy đổi sai, biểu đồ vẽ ra một câu
 * chuyện khác hẳn con số trên thẻ ngay phía trên nó — và không có gì báo.
 */
describe('toChartValue', () => {
  it('quy về ĐỒNG NGUYÊN, bỏ phần lẻ', () => {
    expect(toChartValue('1500000')).toBe(1500000);
    expect(toChartValue('1500000.49')).toBe(1500000);
    expect(toChartValue('1500000.99')).toBe(1500000);
  });

  it('giữ nguyên dấu âm — lợi nhuận âm phải nằm dưới đường 0', () => {
    expect(toChartValue('-2300000')).toBe(-2300000);
  });

  it('thiếu giá trị là 0, không phải NaN — NaN làm recharts bỏ trắng cả cột', () => {
    expect(toChartValue(null)).toBe(0);
    expect(toChartValue(undefined)).toBe(0);
    expect(toChartValue('')).toBe(0);
    expect(toChartValue('không phải số')).toBe(0);
  });

  it('số tiền lớn nhất mà DB cho phép vẫn CHÍNH XÁC, không sai số dấu phẩy động', () => {
    // Trần của `Decimal(14,2)`: 999.999.999.999,99 đồng. Số nguyên an toàn của JS là ~9e15,
    // nên toàn bộ dải tiền hợp lệ nằm gọn trong đó — đây là điều làm phép quy đổi này an toàn.
    const max = '999999999999.99';
    expect(toChartValue(max)).toBe(999999999999);
    expect(Number.isSafeInteger(toChartValue(max))).toBe(true);
  });
});
