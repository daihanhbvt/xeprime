/**
 * Mã tỉnh GIẢ của các spec — MỖI SPEC MỘT MÃ RIÊNG, khai ở đúng MỘT chỗ này.
 *
 * Jest chạy các file spec SONG SONG trên cùng một PostgreSQL. Spec nào cũng `seedProvince` lúc
 * đầu và `province.deleteMany` lúc cuối, nên hai spec dùng chung một mã là một cuộc đua: spec
 * xong trước xoá tỉnh trong khi spec kia còn chi nhánh/tin đăng trỏ vào nó ⇒ FK
 * `public_listings_province_code_fkey` nổ ở `afterAll`, đỏ hay xanh tuỳ thứ tự chạy. Từng xảy ra
 * với `Z4` (ba spec) và `Z7`/`Z8` (hai spec) — đều do chép một spec cũ rồi giữ nguyên mã.
 *
 * Mã nằm ngoài danh mục 34 tỉnh thật (toàn số) nên không đụng dữ liệu thật. Tên cũng phải khác
 * nhau: `provinces.name` và `slug` (suy từ tên) là UNIQUE.
 *
 * KHÔNG khai ở đây: mã CỐ Ý không tồn tại (`ZZ` — thử đường "tỉnh không có trong danh mục"); mã
 * thật (`79`, `01`…) mà spec chỉ đọc, không xoá.
 */
export const TEST_PROVINCE = {
  LISTINGS_SYNC: { code: 'Z1', name: 'Zone Sync' },
  LISTINGS_FACETS: { code: 'Z2', name: 'Zone Facet' },
  PUBLIC_LISTINGS_FILTER_A: { code: 'Z3', name: 'Zone Filter A' },
  PUBLIC_LISTINGS_FILTER_B: { code: 'Z4', name: 'Zone Filter B' },
  PUBLIC_HOME_BIG: { code: 'Z5', name: 'Zone Home Big' },
  PUBLIC_HOME_SMALL: { code: 'Z6', name: 'Zone Home Small' },
  PUBLIC_HOME_LOCKED: { code: 'Z7', name: 'Zone Home Locked' },
  PUBLIC_HOME_EMPTY: { code: 'Z8', name: 'Zone Home Empty' },
  PROVINCES_RESTRICT: { code: 'Z9', name: 'Zone Restrict' },
  LISTING_RANK_COLDSTART: { code: 'Y1', name: 'Zone ColdStart' },
  VEHICLE_MARKETPLACE_VISIBILITY: { code: 'Y2', name: 'Zone Visibility' },
  MARKET_PRICE: { code: 'Y3', name: 'Zone Price' },
  MARKET_PRICE_OTHER: { code: 'Y4', name: 'Zone Price Khac' },
} as const;

// Chặn ngay lúc nạp module: thêm một dòng trùng mã/tên là MỌI spec dùng bảng này đỏ ngay, thay vì
// một spec đỏ thất thường trên CI.
for (const key of ['code', 'name'] as const) {
  const seen = new Map<string, string>();
  for (const [owner, province] of Object.entries(TEST_PROVINCE)) {
    const value = province[key];
    const previous = seen.get(value);
    if (previous) {
      throw new Error(`TEST_PROVINCE: ${previous} và ${owner} trùng ${key} "${value}".`);
    }
    seen.set(value, owner);
  }
}
