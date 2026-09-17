import { describe, expect, it } from 'vitest';
import { PROVINCE_CATALOG } from '@xeprime/types';
import { provinceCenter, provinceCodesMissingCenter } from './province-center';

/**
 * Bảng toạ độ mở bản đồ — ba thứ phải đúng, và cả ba đều hỏng ÂM THẦM nếu không khoá:
 *   1. Đủ 34 tỉnh. Thiếu một mã thì tỉnh đó mở bản đồ ở mặc định (Đà Nẵng) và không ai báo lỗi.
 *   2. Toạ độ nằm trong khung Việt Nam. Đảo nhầm lat/lng cho ra một điểm giữa Ấn Độ Dương —
 *      vẫn là toạ độ hợp lệ, vẫn vẽ được bản đồ, và nhìn qua thì "có chạy".
 *   3. Mã lạ trả `null`, không trả một tỉnh bừa.
 */
describe('provinceCenter', () => {
  it('phủ đủ danh mục tỉnh hiện hành', () => {
    expect(provinceCodesMissingCenter()).toEqual([]);
  });

  it('mọi toạ độ nằm trong khung Việt Nam', () => {
    for (const { code, name } of PROVINCE_CATALOG) {
      const point = provinceCenter(code);
      expect(point, `${code} ${name}`).not.toBeNull();
      // Khung bao đất liền + hải đảo gần bờ: vĩ độ 8,2–23,5 · kinh độ 102–110.
      expect(point!.lat, `${code} ${name} lat`).toBeGreaterThan(8.2);
      expect(point!.lat, `${code} ${name} lat`).toBeLessThan(23.5);
      expect(point!.lng, `${code} ${name} lng`).toBeGreaterThan(102);
      expect(point!.lng, `${code} ${name} lng`).toBeLessThan(110);
    }
  });

  it('mã rỗng hoặc lạ trả null thay vì đoán', () => {
    expect(provinceCenter('')).toBeNull();
    expect(provinceCenter(null)).toBeNull();
    expect(provinceCenter(undefined)).toBeNull();
    expect(provinceCenter('99')).toBeNull();
  });
});
