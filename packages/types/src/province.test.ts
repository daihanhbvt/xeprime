import { describe, expect, it } from 'vitest';
import {
  PROVINCE_ADMINISTRATIVE_TYPE,
  PROVINCE_ALIAS_TYPE,
  PROVINCE_CATALOG,
  PROVINCE_CODES,
  buildProvinceAliasSeeds,
  normalizeProvinceAlias,
  provinceSlug,
} from './province';

/**
 * Danh mục tỉnh là dữ liệu PHÁP LÝ (Quyết định 19/2025/QĐ-TTg) chứ không phải hằng số tiện tay:
 * sai một mã là hàng loạt xe nằm sai tỉnh trên marketplace. Test này khoá đúng bộ 34 mã, khoá
 * luật chuẩn hoá, và khoá tính duy nhất của bí danh — thứ mà ràng buộc UNIQUE dưới DB sẽ bắt
 * bằng cách làm HỎNG migration nếu ta để lọt.
 */
describe('danh mục 34 tỉnh/thành', () => {
  it('đúng 34 đơn vị, đúng bộ mã chính thức', () => {
    expect(PROVINCE_CATALOG).toHaveLength(34);
    expect([...PROVINCE_CODES].sort()).toEqual(
      [
        '01', '04', '08', '11', '12', '14', '15', '19', '20', '22',
        '24', '25', '31', '33', '37', '38', '40', '42', '44', '46',
        '48', '51', '52', '56', '66', '68', '75', '79', '80', '82',
        '86', '91', '92', '96',
      ].sort(),
    );
  });

  it('đúng 6 thành phố trực thuộc trung ương', () => {
    const municipalities = PROVINCE_CATALOG.filter(
      (p) => p.administrativeType === PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    ).map((p) => p.name);
    expect(municipalities).toEqual([
      'Hà Nội',
      'Hải Phòng',
      'Huế',
      'Đà Nẵng',
      'Hồ Chí Minh',
      'Cần Thơ',
    ]);
  });

  it('mã là duy nhất và tên là duy nhất', () => {
    expect(new Set(PROVINCE_CODES).size).toBe(34);
    expect(new Set(PROVINCE_CATALOG.map((p) => p.name)).size).toBe(34);
  });

  it('mỗi mã đúng 2 ký tự số — mã hành chính chính thức, không phải số thứ tự', () => {
    for (const code of PROVINCE_CODES) expect(code).toMatch(/^\d{2}$/);
  });
});

describe('normalizeProvinceAlias', () => {
  it('bỏ khoảng trắng thừa, hoa/thường, dấu câu', () => {
    expect(normalizeProvinceAlias('  Cà   Mau ')).toBe('ca mau');
    expect(normalizeProvinceAlias('BÀ RỊA - VŨNG TÀU')).toBe('ba ria vung tau');
    expect(normalizeProvinceAlias('Bà Rịa-Vũng Tàu')).toBe('ba ria vung tau');
  });

  it('bỏ tiền tố hành chính ở đầu chuỗi', () => {
    expect(normalizeProvinceAlias('Tỉnh Cà Mau')).toBe('ca mau');
    expect(normalizeProvinceAlias('Thành phố Hồ Chí Minh')).toBe('ho chi minh');
    expect(normalizeProvinceAlias('TP. Hồ Chí Minh')).toBe('ho chi minh');
    expect(normalizeProvinceAlias('TP Hà Nội')).toBe('ha noi');
  });

  it('bắt được viết tắt dính liền TPHCM', () => {
    expect(normalizeProvinceAlias('TPHCM')).toBe('hcm');
    expect(normalizeProvinceAlias('TP HCM')).toBe('hcm');
    expect(normalizeProvinceAlias('TP. HCM')).toBe('hcm');
  });

  it('bỏ dấu tiếng Việt kể cả `đ`', () => {
    expect(normalizeProvinceAlias('Đà Nẵng')).toBe('da nang');
    expect(normalizeProvinceAlias('Đắk Lắk')).toBe('dak lak');
    expect(normalizeProvinceAlias('Đồng Tháp')).toBe('dong thap');
  });

  it('không nuốt nhầm tên bắt đầu bằng `Thanh`/`Tinh`', () => {
    expect(normalizeProvinceAlias('Thanh Hóa')).toBe('thanh hoa');
    expect(normalizeProvinceAlias('Ninh Bình')).toBe('ninh binh');
  });

  it('chuỗi rỗng/rác ra chuỗi rỗng — caller phân biệt được "không xác định"', () => {
    expect(normalizeProvinceAlias('   ')).toBe('');
    expect(normalizeProvinceAlias('---')).toBe('');
  });
});

describe('provinceSlug', () => {
  it('không dấu, nối bằng gạch ngang', () => {
    expect(provinceSlug('Hồ Chí Minh')).toBe('ho-chi-minh');
    expect(provinceSlug('Bà Rịa - Vũng Tàu')).toBe('ba-ria-vung-tau');
  });
});

describe('bí danh tỉnh', () => {
  const seeds = buildProvinceAliasSeeds();
  const byNormalized = new Map(seeds.map((s) => [s.normalizedAlias, s]));
  const resolve = (raw: string): string | undefined =>
    byNormalized.get(normalizeProvinceAlias(raw))?.provinceCode;

  it('`normalizedAlias` là duy nhất — điều kiện của UNIQUE dưới DB', () => {
    expect(new Set(seeds.map((s) => s.normalizedAlias)).size).toBe(seeds.length);
  });

  it('mọi tên chuẩn tự resolve về chính nó', () => {
    for (const p of PROVINCE_CATALOG) {
      expect(resolve(p.name)).toBe(p.code);
    }
  });

  it('mọi bí danh trỏ tới một mã có thật trong danh mục', () => {
    for (const s of seeds) expect(PROVINCE_CODES).toContain(s.provinceCode);
  });

  it('tên tỉnh CŨ (trước 01/07/2025) map đúng tỉnh sáp nhập', () => {
    const merged: Record<string, string> = {
      'Hà Giang': '08',
      'Yên Bái': '15',
      'Bắc Kạn': '19',
      'Vĩnh Phúc': '25',
      'Hòa Bình': '25',
      'Bắc Giang': '24',
      'Thái Bình': '33',
      'Hải Dương': '31',
      'Hà Nam': '37',
      'Nam Định': '37',
      'Quảng Bình': '44',
      'Quảng Nam': '48',
      'Kon Tum': '51',
      'Bình Định': '52',
      'Ninh Thuận': '56',
      'Đắk Nông': '68',
      'Bình Thuận': '68',
      'Phú Yên': '66',
      'Bình Dương': '79',
      'Bà Rịa - Vũng Tàu': '79',
      'Bình Phước': '75',
      'Long An': '80',
      'Hậu Giang': '92',
      'Sóc Trăng': '92',
      'Bến Tre': '86',
      'Trà Vinh': '86',
      'Tiền Giang': '82',
      'Bạc Liêu': '96',
      'Kiên Giang': '91',
      'Thừa Thiên Huế': '46',
    };
    for (const [legacy, code] of Object.entries(merged)) {
      expect(resolve(legacy), `${legacy} phải map về ${code}`).toBe(code);
    }
  });

  it('các biến thể viết của TP.HCM đều về mã 79', () => {
    for (const variant of [
      'TP HCM',
      'TP. HCM',
      'TPHCM',
      'Thành phố Hồ Chí Minh',
      'TP. Hồ Chí Minh',
      'Hồ Chí Minh',
      'hồ chí minh',
      '  Hồ  Chí  Minh  ',
    ]) {
      expect(resolve(variant), variant).toBe('79');
    }
  });

  it('biến thể của các thành phố trực thuộc TW khác cũng resolve', () => {
    expect(resolve('TP Hà Nội')).toBe('01');
    expect(resolve('Thành phố Hà Nội')).toBe('01');
    expect(resolve('TP Đà Nẵng')).toBe('48');
    expect(resolve('Thành phố Đà Nẵng')).toBe('48');
    expect(resolve('Thành phố Hải Phòng')).toBe('31');
    expect(resolve('TP Cần Thơ')).toBe('92');
    expect(resolve('Thành phố Huế')).toBe('46');
  });

  it('tên không thuộc danh mục KHÔNG được đoán bừa', () => {
    expect(resolve('Vientiane')).toBeUndefined();
    expect(resolve('Chi nhánh 1')).toBeUndefined();
    expect(resolve('')).toBeUndefined();
  });

  it('mỗi tên chuẩn có đúng một bản ghi loại canonical_name', () => {
    const canonical = seeds.filter((s) => s.aliasType === PROVINCE_ALIAS_TYPE.CANONICAL_NAME);
    expect(canonical).toHaveLength(34);
    expect(new Set(canonical.map((s) => s.provinceCode)).size).toBe(34);
  });
});
