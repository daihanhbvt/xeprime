/**
 * Đơn vị hành chính CẤP XÃ — xã / phường / đặc khu.
 *
 * Từ 01/07/2025 Việt Nam chạy mô hình hành chính **HAI CẤP**: tỉnh/thành → xã/phường/đặc khu.
 * Cấp huyện/quận đã bỏ, nên KHÔNG có (và không được thêm) danh mục quận/huyện ở đây — mọi ô
 * nhập địa chỉ chỉ có hai cấp chọn, phần còn lại (số nhà, đường) là chữ do người dùng gõ.
 *
 * Khác `province.ts` ở một điểm quan trọng: file này **không chứa dữ liệu**. 3.321 đơn vị cấp xã
 * nằm ở `prisma/data/ward-catalog.json` (tải từ nguồn nhà nước bằng `fetch-ward-catalog.ts`) và
 * nạp vào bảng `wards` bằng migration. Nhúng chúng vào một package mà cả web lẫn app native đều
 * import là bắt mọi bundle gánh ~300KB danh mục để rồi vẫn phải gọi API lọc theo tỉnh.
 *
 * Ở đây chỉ có: kiểu, hằng số loại đơn vị, và hàm chuẩn hoá khoá tìm kiếm.
 */
import { normalizeProvinceAlias } from './province';

/** Loại đơn vị hành chính cấp xã (mô hình 2 cấp từ 01/07/2025). */
export const WARD_ADMINISTRATIVE_TYPE = {
  /** Phường — đơn vị đô thị. */
  WARD: 'ward',
  /** Xã — đơn vị nông thôn. */
  COMMUNE: 'commune',
  /** Đặc khu — đơn vị hành chính đặc biệt (Phú Quốc, Côn Đảo, Cát Hải…). */
  SPECIAL_ZONE: 'special_zone',
} as const;

export type WardAdministrativeType =
  (typeof WARD_ADMINISTRATIVE_TYPE)[keyof typeof WARD_ADMINISTRATIVE_TYPE];

export const WARD_ADMINISTRATIVE_TYPE_VALUES = Object.values(
  WARD_ADMINISTRATIVE_TYPE,
) as readonly WardAdministrativeType[];

/** Độ dài mã hành chính — cấp tỉnh 2 ký tự, cấp xã 5 ký tự (Quyết định 19/2025/QĐ-TTg). */
export const PROVINCE_CODE_LENGTH = 2;
export const WARD_CODE_LENGTH = 5;

const WARD_CODE_PATTERN = /^\d{5}$/;
const PROVINCE_CODE_PATTERN = /^\d{2}$/;

export function isWardCode(value: unknown): value is string {
  return typeof value === 'string' && WARD_CODE_PATTERN.test(value);
}

export function isProvinceCode(value: unknown): value is string {
  return typeof value === 'string' && PROVINCE_CODE_PATTERN.test(value);
}

/**
 * Khoá tìm kiếm của một tên cấp xã: bỏ dấu, bỏ hoa/thường, bỏ dấu câu, bỏ tiền tố loại đơn vị.
 *
 * Dùng CHUNG bộ chuẩn hoá của cấp tỉnh (`normalizeProvinceAlias`) rồi cắt thêm tiền tố cấp xã —
 * hai bộ quy tắc bỏ dấu song song là chỗ chắc chắn sẽ lệch nhau ở ký tự thứ n.
 *
 * Bỏ tiền tố để khách gõ `"ba dinh"` tìm ra `"Phường Ba Đình"`; bản thân tiền tố không phân biệt
 * được gì (mỗi tỉnh có hàng trăm "Xã").
 *
 * Ví dụ: `"Phường Bến Nghé"` → `"ben nghe"`, `"Đặc khu Phú Quốc"` → `"phu quoc"`.
 */
export function normalizeWardName(raw: string): string {
  return normalizeProvinceAlias(raw).replace(/^(phuong|xa|dac khu|thi tran)\s+/, '');
}

/**
 * Một đơn vị cấp xã như API trả về. Trùng shape với `ward-catalog.json` cộng thêm khoá tìm kiếm
 * (do DB tính) — bản soạn không giữ khoá đó vì nó suy được và giữ hai bản là giữ hai sự thật.
 */
export interface WardCatalogEntry {
  /** Mã hành chính chính thức 5 chữ số. BẤT BIẾN khi đã có dữ liệu tham chiếu. */
  code: string;
  /** Mã tỉnh chứa đơn vị này. */
  provinceCode: string;
  /** Tên đầy đủ có tiền tố loại: `"Phường Ba Đình"`. */
  name: string;
  /** Tên trần không tiền tố: `"Ba Đình"` — dùng khi ghép địa chỉ hiển thị đã có ngữ cảnh. */
  shortName: string;
  administrativeType: WardAdministrativeType;
}
