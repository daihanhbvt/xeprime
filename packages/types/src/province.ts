/**
 * Danh mục tỉnh/thành CHÍNH THỨC của Việt Nam từ 01/07/2025 — Nghị quyết sắp xếp đơn vị hành
 * chính cấp tỉnh (Quyết định 19/2025/QĐ-TTg), 34 đơn vị: 28 tỉnh + 6 thành phố trực thuộc TW.
 *
 * File này là NƠI SOẠN dữ liệu, không phải nguồn đọc lúc chạy. Nguồn sự thật lúc chạy là bảng
 * `provinces` trong PostgreSQL — migration `20260814..._add_province_catalog` chèn đúng bộ này
 * nên MỌI môi trường có dữ liệu ngay sau khi deploy, không phụ thuộc ai chạy seed demo.
 * Script `prisma/scripts/gen-province-sql.ts` sinh phần INSERT của migration TỪ file này, nên
 * hai bên không thể lệch nhau âm thầm (`province-catalog.spec.ts` khoá lại điều đó).
 *
 * Frontend KHÔNG import danh sách này để dựng dropdown — nó gọi API (`/provinces`,
 * `/public/destinations`). Ở đây chỉ có: mã để validate, tên chuẩn để sinh migration, và bộ
 * bí danh để quy dữ liệu tự do cũ về mã chuẩn.
 */

/** Loại đơn vị hành chính cấp tỉnh. */
export const PROVINCE_ADMINISTRATIVE_TYPE = {
  /** Tỉnh. */
  PROVINCE: 'province',
  /** Thành phố trực thuộc trung ương. */
  MUNICIPALITY: 'municipality',
} as const;

export type ProvinceAdministrativeType =
  (typeof PROVINCE_ADMINISTRATIVE_TYPE)[keyof typeof PROVINCE_ADMINISTRATIVE_TYPE];

/** Vì sao một chuỗi được coi là chỉ tới tỉnh này. */
export const PROVINCE_ALIAS_TYPE = {
  /** Chính tên chuẩn hiện hành. */
  CANONICAL_NAME: 'canonical_name',
  /** Tên đơn vị hành chính CŨ đã sáp nhập vào tỉnh này (trước 01/07/2025). */
  LEGACY_NAME: 'legacy_name',
  /** Cách viết khác của cùng một tên (TP HCM, Thành phố Hà Nội…). */
  DISPLAY_VARIANT: 'display_variant',
} as const;

export type ProvinceAliasType = (typeof PROVINCE_ALIAS_TYPE)[keyof typeof PROVINCE_ALIAS_TYPE];

export interface ProvinceCatalogEntry {
  /** Mã đơn vị hành chính chính thức, 2 ký tự, BẤT BIẾN sau khi đã có dữ liệu tham chiếu. */
  code: string;
  /** Tên hiển thị chuẩn (tiếng Việt có dấu) — luôn trả về dạng này cho người dùng. */
  name: string;
  administrativeType: ProvinceAdministrativeType;
  sortOrder: number;
  /**
   * Tên đơn vị hành chính CŨ bị sáp nhập vào (KHÔNG lặp lại tên chuẩn).
   * Nguồn: danh sách sáp nhập kèm theo quyết định.
   */
  legacyNames?: readonly string[];
  /** Cách viết khác của chính tên chuẩn. */
  displayVariants?: readonly string[];
}

/**
 * Biến thể cách viết cho 6 thành phố trực thuộc TW.
 *
 * Chuẩn hoá đã bỏ tiền tố hành chính rồi, nên `TP Hà Nội` và `Hà Nội` ra cùng một khoá — các
 * biến thể này chủ yếu để bảng `province_aliases` đọc được như tài liệu, và để bắt những dạng
 * viết tắt KHÔNG suy ra được bằng luật (`TPHCM`, `HCM`).
 */
function municipalityVariants(name: string): readonly string[] {
  return [`TP ${name}`, `TP. ${name}`, `Thành phố ${name}`];
}

/** 34 đơn vị hành chính cấp tỉnh, thứ tự theo mã. */
export const PROVINCE_CATALOG: readonly ProvinceCatalogEntry[] = [
  {
    code: '01',
    name: 'Hà Nội',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    sortOrder: 1,
    displayVariants: municipalityVariants('Hà Nội'),
  },
  {
    code: '04',
    name: 'Cao Bằng',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 2,
  },
  {
    code: '08',
    name: 'Tuyên Quang',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 3,
    legacyNames: ['Hà Giang'],
  },
  {
    code: '11',
    name: 'Điện Biên',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 4,
  },
  {
    code: '12',
    name: 'Lai Châu',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 5,
  },
  {
    code: '14',
    name: 'Sơn La',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 6,
  },
  {
    code: '15',
    name: 'Lào Cai',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 7,
    legacyNames: ['Yên Bái'],
  },
  {
    code: '19',
    name: 'Thái Nguyên',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 8,
    legacyNames: ['Bắc Kạn', 'Bắc Cạn'],
  },
  {
    code: '20',
    name: 'Lạng Sơn',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 9,
  },
  {
    code: '22',
    name: 'Quảng Ninh',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 10,
  },
  {
    code: '24',
    name: 'Bắc Ninh',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 11,
    legacyNames: ['Bắc Giang'],
  },
  {
    code: '25',
    name: 'Phú Thọ',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 12,
    legacyNames: ['Vĩnh Phúc', 'Hòa Bình', 'Hoà Bình'],
  },
  {
    code: '31',
    name: 'Hải Phòng',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    sortOrder: 13,
    legacyNames: ['Hải Dương'],
    displayVariants: municipalityVariants('Hải Phòng'),
  },
  {
    code: '33',
    name: 'Hưng Yên',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 14,
    legacyNames: ['Thái Bình'],
  },
  {
    code: '37',
    name: 'Ninh Bình',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 15,
    legacyNames: ['Hà Nam', 'Nam Định'],
  },
  {
    code: '38',
    name: 'Thanh Hóa',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 16,
    displayVariants: ['Thanh Hoá'],
  },
  {
    code: '40',
    name: 'Nghệ An',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 17,
  },
  {
    code: '42',
    name: 'Hà Tĩnh',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 18,
  },
  {
    code: '44',
    name: 'Quảng Trị',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 19,
    legacyNames: ['Quảng Bình'],
  },
  {
    code: '46',
    name: 'Huế',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    sortOrder: 20,
    // `Thừa Thiên Huế` là tên cũ của chính đơn vị này (không phải sáp nhập từ tỉnh khác), nhưng
    // dữ liệu tự do trong DB gần như chắc chắn còn dạng đó — không có bí danh này thì bản ghi cũ
    // rơi vào diện "không xác định" một cách vô lý.
    legacyNames: ['Thừa Thiên Huế', 'Thừa Thiên - Huế', 'Thừa Thiên-Huế'],
    displayVariants: municipalityVariants('Huế'),
  },
  {
    code: '48',
    name: 'Đà Nẵng',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    sortOrder: 21,
    legacyNames: ['Quảng Nam'],
    displayVariants: municipalityVariants('Đà Nẵng'),
  },
  {
    code: '51',
    name: 'Quảng Ngãi',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 22,
    legacyNames: ['Kon Tum'],
  },
  {
    code: '52',
    name: 'Gia Lai',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 23,
    legacyNames: ['Bình Định'],
  },
  {
    code: '56',
    name: 'Khánh Hòa',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 24,
    legacyNames: ['Ninh Thuận'],
    displayVariants: ['Khánh Hoà'],
  },
  {
    code: '66',
    name: 'Đắk Lắk',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 25,
    legacyNames: ['Phú Yên'],
    displayVariants: ['Đăk Lăk', 'Dak Lak'],
  },
  {
    code: '68',
    name: 'Lâm Đồng',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 26,
    legacyNames: ['Đắk Nông', 'Đăk Nông', 'Bình Thuận'],
  },
  {
    code: '75',
    name: 'Đồng Nai',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 27,
    legacyNames: ['Bình Phước'],
  },
  {
    code: '79',
    name: 'Hồ Chí Minh',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    sortOrder: 28,
    legacyNames: ['Bình Dương', 'Bà Rịa - Vũng Tàu', 'Bà Rịa Vũng Tàu', 'Bà Rịa-Vũng Tàu'],
    displayVariants: [
      ...municipalityVariants('Hồ Chí Minh'),
      'TP HCM',
      'TP. HCM',
      'TPHCM',
      'HCM',
      'Sài Gòn',
    ],
  },
  {
    code: '80',
    name: 'Tây Ninh',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 29,
    legacyNames: ['Long An'],
  },
  {
    code: '82',
    name: 'Đồng Tháp',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 30,
    legacyNames: ['Tiền Giang'],
  },
  {
    code: '86',
    name: 'Vĩnh Long',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 31,
    legacyNames: ['Bến Tre', 'Trà Vinh'],
  },
  {
    code: '91',
    name: 'An Giang',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 32,
    legacyNames: ['Kiên Giang'],
  },
  {
    code: '92',
    name: 'Cần Thơ',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.MUNICIPALITY,
    sortOrder: 33,
    legacyNames: ['Hậu Giang', 'Sóc Trăng'],
    displayVariants: municipalityVariants('Cần Thơ'),
  },
  {
    code: '96',
    name: 'Cà Mau',
    administrativeType: PROVINCE_ADMINISTRATIVE_TYPE.PROVINCE,
    sortOrder: 34,
    legacyNames: ['Bạc Liêu'],
  },
] as const;

/** 34 mã chính thức — dùng để validate nhanh mà không phải chạm DB. */
export const PROVINCE_CODES: readonly string[] = PROVINCE_CATALOG.map((p) => p.code);

/**
 * Khoá tra cứu của một chuỗi địa danh do người dùng/dữ liệu cũ cung cấp.
 *
 * Bỏ: khoảng trắng thừa, khác biệt hoa/thường, dấu câu, tiền tố hành chính, và DẤU tiếng Việt.
 * Bỏ dấu CHỈ để tra cứu — tên hiển thị luôn trả về bản chuẩn có dấu từ DB.
 *
 * Ví dụ: `" TP. Hồ  Chí Minh "` → `"ho chi minh"`, `"TPHCM"` → `"hcm"`, `"Tỉnh Cà Mau"` → `"ca mau"`.
 */
export function normalizeProvinceAlias(raw: string): string {
  const withoutDiacritics = raw
    .normalize('NFD')
    // Dải dấu thanh/dấu phụ tổ hợp. `đ`/`Đ` KHÔNG nằm trong dải này (ký tự độc lập) nên xử riêng.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'));

  return (
    withoutDiacritics
      .toLowerCase()
      // Mọi thứ không phải chữ/số thành khoảng trắng: nuốt luôn khác biệt dấu câu (`-`, `.`, `,`).
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      // Tiền tố hành chính ở ĐẦU chuỗi. `tp` không cần dấu phân cách để bắt được `TPHCM`;
      // không tên chuẩn nào bắt đầu bằng `tp` nên không có va chạm.
      .replace(/^(thanh pho|tinh|t p|tp)\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Slug ổn định cho URL/route (không dấu, nối bằng `-`). */
export function provinceSlug(name: string): string {
  return normalizeProvinceAlias(name).replace(/\s+/g, '-');
}

export interface ProvinceAliasSeed {
  provinceCode: string;
  alias: string;
  normalizedAlias: string;
  aliasType: ProvinceAliasType;
}

/**
 * Toàn bộ bí danh sẽ nạp vào `province_aliases`, đã KHỬ TRÙNG theo `normalizedAlias`.
 *
 * Khử trùng là bắt buộc chứ không phải dọn dẹp: `Hà Nội`, `TP Hà Nội` và `Thành phố Hà Nội` đều
 * chuẩn hoá về `ha noi`, mà cột `normalized_alias` là UNIQUE. Ưu tiên giữ bản ghi có ý nghĩa
 * nhất: tên chuẩn > tên cũ > biến thể hiển thị.
 */
export function buildProvinceAliasSeeds(): ProvinceAliasSeed[] {
  const byNormalized = new Map<string, ProvinceAliasSeed>();
  const priority: Record<ProvinceAliasType, number> = {
    [PROVINCE_ALIAS_TYPE.CANONICAL_NAME]: 3,
    [PROVINCE_ALIAS_TYPE.LEGACY_NAME]: 2,
    [PROVINCE_ALIAS_TYPE.DISPLAY_VARIANT]: 1,
  };

  const push = (provinceCode: string, alias: string, aliasType: ProvinceAliasType): void => {
    const normalizedAlias = normalizeProvinceAlias(alias);
    if (!normalizedAlias) return;
    const existing = byNormalized.get(normalizedAlias);
    if (existing && priority[existing.aliasType] >= priority[aliasType]) return;
    byNormalized.set(normalizedAlias, { provinceCode, alias, normalizedAlias, aliasType });
  };

  for (const p of PROVINCE_CATALOG) {
    push(p.code, p.name, PROVINCE_ALIAS_TYPE.CANONICAL_NAME);
    for (const legacy of p.legacyNames ?? []) {
      push(p.code, legacy, PROVINCE_ALIAS_TYPE.LEGACY_NAME);
    }
    for (const variant of p.displayVariants ?? []) {
      push(p.code, variant, PROVINCE_ALIAS_TYPE.DISPLAY_VARIANT);
    }
  }

  return [...byNormalized.values()].sort(
    (a, b) =>
      a.provinceCode.localeCompare(b.provinceCode) ||
      a.normalizedAlias.localeCompare(b.normalizedAlias),
  );
}
