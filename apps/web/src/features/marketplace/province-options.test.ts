import { describe, expect, it } from 'vitest';
import { buildProvinceOptions, provinceLabelOf } from './province-options';
import type { PublicDestination } from './types';

/**
 * Bộ chọn địa điểm dùng CHUNG cho hero desktop, dialog mobile và ô sửa ở `/search`.
 *
 * Điều test này khoá: ba lối vào không thể hiện ba danh sách khác nhau (cùng một hàm, cùng một
 * nguồn `/public/destinations`), và một lựa chọn cũ không còn khả dụng KHÔNG bị âm thầm bỏ —
 * bỏ nghĩa là tìm toàn quốc và trả về xe ở tỉnh khác.
 */
/**
 * Nhãn được TRUYỀN VÀO, không do hàm sở hữu: cùng một từ "Toàn quốc" phải có đúng một nguồn,
 * và nguồn đó là bó message (`HomeSearch.location.*`). Test dùng đúng chữ tiếng Việt của bó đó.
 */
const LABELS = { nationwide: 'Toàn quốc', unavailable: 'Địa điểm không còn khả dụng' };

const DESTINATIONS: PublicDestination[] = [
  { provinceCode: '79', provinceName: 'Hồ Chí Minh', vehicleCount: 12, imageUrl: null },
  { provinceCode: '48', provinceName: 'Đà Nẵng', vehicleCount: 5, imageUrl: null },
];

describe('buildProvinceOptions', () => {
  it('luôn có "Toàn quốc" đứng đầu, giá trị là chuỗi rỗng', () => {
    const options = buildProvinceOptions(DESTINATIONS, undefined, LABELS);
    expect(options[0]).toEqual({ value: '', label: 'Toàn quốc' });
  });

  it('giá trị option là MÃ tỉnh, nhãn là tên chuẩn', () => {
    const options = buildProvinceOptions(DESTINATIONS, undefined, LABELS);
    expect(options.slice(1)).toEqual([
      { value: '79', label: 'Hồ Chí Minh' },
      { value: '48', label: 'Đà Nẵng' },
    ]);
  });

  it('desktop và mobile nhận ĐÚNG cùng một danh sách từ cùng dữ liệu', () => {
    expect(buildProvinceOptions(DESTINATIONS, '79', LABELS)).toEqual(
      buildProvinceOptions(DESTINATIONS, '79', LABELS),
    );
  });

  it('lựa chọn cũ không còn trong danh sách được GIỮ và ghi rõ là không khả dụng', () => {
    const options = buildProvinceOptions(DESTINATIONS, '96', LABELS);
    const stale = options.find((o) => o.value === '96');
    expect(stale).toEqual({ value: '96', label: LABELS.unavailable, unavailable: true });
    // Vẫn còn đủ các lựa chọn hợp lệ để đổi sang.
    expect(options.some((o) => o.value === '79')).toBe(true);
  });

  it('lựa chọn còn hợp lệ KHÔNG bị nhân đôi', () => {
    const options = buildProvinceOptions(DESTINATIONS, '79', LABELS);
    expect(options.filter((o) => o.value === '79')).toHaveLength(1);
  });

  it('chưa tải xong (undefined) vẫn dựng được ô chọn với "Toàn quốc"', () => {
    expect(buildProvinceOptions(undefined, undefined, LABELS)).toEqual([{ value: '', label: 'Toàn quốc' }]);
  });
});

describe('provinceLabelOf', () => {
  it('trả tên chuẩn cho mã đang có xe', () => {
    expect(provinceLabelOf(DESTINATIONS, '48')).toBe('Đà Nẵng');
  });

  it('mã không còn khả dụng → null để caller nói rõ, không hiện "Toàn quốc" sai sự thật', () => {
    expect(provinceLabelOf(DESTINATIONS, '96')).toBeNull();
    expect(provinceLabelOf(DESTINATIONS, undefined)).toBeNull();
  });
});
