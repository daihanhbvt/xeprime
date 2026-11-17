/**
 * Dữ liệu xe chuẩn (ADR 0090) — màn "Dữ liệu xe" của quản trị: mỗi dòng là MỘT xe (hãng · dòng ·
 * phiên bản · đời) mang đủ thông số, tiện ích, giá bán tham khảo và giá thuê tham khảo. Mã đi trên
 * dây + luật thuần dùng chung giữa API (DTO, service, import) và web (form, danh sách, gợi ý).
 */
import { INSURANCE_VALUE_TIER_LIMITS } from './status/insurance';
import { VEHICLE_TYPE } from './status/vehicle';

// ── Trạng thái duyệt + nguồn gốc ───────────────────────────────────────────────────────────────

/**
 * `pending` = dữ liệu tự ghi nhận từ xe của chủ xe (hoặc dòng xe chủ xe gõ mới), CHƯA gợi ý cho ai;
 * admin duyệt / gộp / từ chối. Dữ liệu admin tạo hoặc nhập file luôn `approved`.
 */
export const CATALOG_REVIEW_STATUS = {
  APPROVED: 'approved',
  PENDING: 'pending',
  REJECTED: 'rejected',
} as const;
export type CatalogReviewStatus =
  (typeof CATALOG_REVIEW_STATUS)[keyof typeof CATALOG_REVIEW_STATUS];
export const CATALOG_REVIEW_STATUS_VALUES = Object.values(
  CATALOG_REVIEW_STATUS,
) as CatalogReviewStatus[];

/** Dòng xe (`vehicle_catalog_models`) đến từ đâu. */
export const CATALOG_ORIGIN = {
  SEED: 'seed',
  ADMIN: 'admin',
  IMPORT: 'import',
  OWNER: 'owner',
} as const;
export type CatalogOrigin = (typeof CATALOG_ORIGIN)[keyof typeof CATALOG_ORIGIN];
export const CATALOG_ORIGIN_VALUES = Object.values(CATALOG_ORIGIN) as CatalogOrigin[];

/** Xe chuẩn đến từ đâu — cột "Nguồn tạo" của danh sách. */
export const VEHICLE_DATA_ORIGIN = {
  ADMIN: 'admin',
  IMPORT: 'import',
  OWNER: 'owner',
} as const;
export type VehicleDataOrigin = (typeof VEHICLE_DATA_ORIGIN)[keyof typeof VEHICLE_DATA_ORIGIN];
export const VEHICLE_DATA_ORIGIN_VALUES = Object.values(VEHICLE_DATA_ORIGIN) as VehicleDataOrigin[];

/**
 * Trạng thái HIỂN THỊ của một xe chuẩn — suy từ (`review_status`, `active`), là chiều lọc của
 * danh sách: đang gợi ý · đã ẩn · chờ duyệt.
 */
export const VEHICLE_DATA_STATUS = {
  ACTIVE: 'active',
  HIDDEN: 'hidden',
  PENDING: 'pending',
} as const;
export type VehicleDataStatus = (typeof VEHICLE_DATA_STATUS)[keyof typeof VEHICLE_DATA_STATUS];
export const VEHICLE_DATA_STATUS_VALUES = Object.values(VEHICLE_DATA_STATUS) as VehicleDataStatus[];

export function vehicleDataStatus(row: { reviewStatus: string; active: boolean }): VehicleDataStatus {
  if (row.reviewStatus === CATALOG_REVIEW_STATUS.PENDING) return VEHICLE_DATA_STATUS.PENDING;
  return row.active ? VEHICLE_DATA_STATUS.ACTIVE : VEHICLE_DATA_STATUS.HIDDEN;
}

/**
 * Trần dữ liệu MỚI một gian hàng tạo ra trong 24 giờ trượt (dòng xe gõ mới + xe chuẩn tự ghi nhận).
 * Quá trần thì xe vẫn lưu bình thường, chỉ không ghi nhận thêm.
 */
export const CATALOG_PROPOSALS_PER_DAY = 20;

/** Giới hạn trường — DTO, import và form đọc cùng bảng. */
export const VEHICLE_DATA_LIMITS = {
  labelMax: 120,
  yearMin: 1950,
  yearMax: 2200,
  /** Giá bán / giá thuê: số nguyên VND, tới 100 tỷ. */
  priceMax: 100_000_000_000,
  featuresMax: 40,
  noteMax: 500,
} as const;

/**
 * Khoá ổn định của phiên bản trong một dòng xe: slug của tên ("1.5G CVT" ⇒ `1-5g-cvt`). Tên rỗng
 * ⇒ '' (xe không phân biệt phiên bản).
 */
export function catalogVariantKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ── Trường của một xe chuẩn ────────────────────────────────────────────────────────────────────

/** Thông số — đúng tên cột của `vehicles`, nên "Áp dụng thông số" là một phép chép thẳng. */
export const VEHICLE_DATA_SPEC_FIELDS = [
  'seatCount',
  'bodyType',
  'fuelType',
  'transmission',
  'engineDisplacementCc',
  'horsepowerHp',
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'fuelConsumptionCombined',
  'electricRangeKm',
  'batteryCapacityKwh',
] as const;
export type VehicleDataSpecField = (typeof VEHICLE_DATA_SPEC_FIELDS)[number];

/**
 * Giá thuê tham khảo — mỗi ô ứng đúng một ô giá của form xe (cùng tên cột ở `vehicles`). Thứ tự là
 * thứ tự hiển thị và thứ tự cột trong file.
 */
export const VEHICLE_DATA_RENT_FIELDS = [
  'hourlyPrice',
  'weekdayPrice',
  'weekendPrice',
  'monthlyPrice',
  'withDriverDailyPrice',
] as const;
export type VehicleDataRentField = (typeof VEHICLE_DATA_RENT_FIELDS)[number];

/** Nhóm dữ liệu còn thiếu — cột "Đầy đủ" và bộ lọc "Thiếu dữ liệu" của danh sách. */
export const VEHICLE_DATA_GAP = {
  /** Thiếu thông số cốt lõi (ô tô: số chỗ, kiểu dáng, nhiên liệu, hộp số; xe máy: nhiên liệu, hộp số). */
  SPEC: 'spec',
  /** Chưa có giá bán tham khảo — không gợi ý được giá trị xe cho bảo hiểm (ô tô). */
  LIST_PRICE: 'list_price',
  /** Chưa có giá thuê ngày thường — ô giá chính của form. */
  RENT: 'rent',
} as const;
export type VehicleDataGap = (typeof VEHICLE_DATA_GAP)[keyof typeof VEHICLE_DATA_GAP];
export const VEHICLE_DATA_GAP_VALUES = Object.values(VEHICLE_DATA_GAP) as VehicleDataGap[];

/** Giá trị lọc "thiếu ít nhất một nhóm" — ô số liệu "Thiếu dữ liệu" của danh sách. */
export const VEHICLE_DATA_GAP_ANY = 'any';
export const VEHICLE_DATA_GAP_FILTER_VALUES = [...VEHICLE_DATA_GAP_VALUES, VEHICLE_DATA_GAP_ANY] as const;

export interface VehicleDataGapInput {
  vehicleType: string;
  seatCount: number | null;
  bodyType: string | null;
  fuelType: string | null;
  transmission: string | null;
  listPrice: string | null;
  weekdayPrice: string | null;
}

/** Các nhóm còn thiếu của một xe chuẩn — luật DUY NHẤT cho cả cột hiển thị lẫn bộ lọc SQL. */
export function vehicleDataGaps(row: VehicleDataGapInput): VehicleDataGap[] {
  const gaps: VehicleDataGap[] = [];
  const isCar = row.vehicleType === VEHICLE_TYPE.CAR;
  const specMissing =
    !row.fuelType || !row.transmission || (isCar && (row.seatCount == null || !row.bodyType));
  if (specMissing) gaps.push(VEHICLE_DATA_GAP.SPEC);
  if (isCar && !row.listPrice) gaps.push(VEHICLE_DATA_GAP.LIST_PRICE);
  if (!row.weekdayPrice) gaps.push(VEHICLE_DATA_GAP.RENT);
  return gaps;
}

// ── Nhập file ──────────────────────────────────────────────────────────────────────────────────

export const VEHICLE_DATA_IMPORT_STATUS = {
  PREVIEWED: 'previewed',
  APPLIED: 'applied',
  DISCARDED: 'discarded',
} as const;
export type VehicleDataImportStatus =
  (typeof VEHICLE_DATA_IMPORT_STATUS)[keyof typeof VEHICLE_DATA_IMPORT_STATUS];
export const VEHICLE_DATA_IMPORT_STATUS_VALUES = Object.values(
  VEHICLE_DATA_IMPORT_STATUS,
) as VehicleDataImportStatus[];

/** Việc một dòng file sẽ làm (xem trước) / đã làm (sau khi áp dụng). */
export const VEHICLE_DATA_ROW_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  UNCHANGED: 'unchanged',
  ERROR: 'error',
} as const;
export type VehicleDataRowAction =
  (typeof VEHICLE_DATA_ROW_ACTION)[keyof typeof VEHICLE_DATA_ROW_ACTION];
export const VEHICLE_DATA_ROW_ACTION_VALUES = Object.values(
  VEHICLE_DATA_ROW_ACTION,
) as VehicleDataRowAction[];

export const VEHICLE_DATA_IMPORT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxRows: 5000,
  /** Bản xem trước chỉ áp dụng được trong khoảng này. */
  previewTtlHours: 24,
  fileNameMax: 255,
} as const;

export const VEHICLE_DATA_IMPORT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
] as const;

/**
 * Vấn đề của MỘT dòng file — mã đi trên dây, màn quản trị dịch (ADR 0012). `error` chặn dòng,
 * `warning`/`info` vẫn áp dụng. Tham số (`field`, `value`) đi kèm mã, không ghép sẵn câu.
 */
export const VEHICLE_DATA_ISSUE = {
  /** Thiếu ô bắt buộc (`field`). */
  REQUIRED: 'required',
  /** Ô không phải số hợp lệ / ngoài khoảng (`field`, `value`). */
  INVALID_NUMBER: 'invalid_number',
  /** Giá trị không thuộc bộ mã (`field`, `value`). */
  INVALID_VALUE: 'invalid_value',
  /** Năm đến < năm từ. */
  YEAR_RANGE: 'year_range',
  /** Thông số mâu thuẫn luật loại xe / nhiên liệu / hộp số (`value` = mô tả). */
  INVALID_SPEC: 'invalid_spec',
  /** Tiện ích không nhận ra (`value`) — bỏ tiện ích đó, dòng vẫn áp dụng. */
  UNKNOWN_FEATURE: 'unknown_feature',
  /** Cùng một xe xuất hiện ở dòng trước trong file (`value` = số dòng đó). */
  DUPLICATE_ROW: 'duplicate_row',
  /** Cột "Mã" không trỏ tới xe chuẩn nào còn sống (`value`). */
  ID_NOT_FOUND: 'id_not_found',
  /** Đổi hãng/dòng/phiên bản/đời làm dòng trùng một xe chuẩn khác (`value` = tên xe đó). */
  IDENTITY_TAKEN: 'identity_taken',
  /** Xe chuẩn đang chờ duyệt: cột "Trạng thái" bị bỏ qua (duyệt ở màn quản trị). */
  STATUS_IGNORED: 'status_ignored',
  /** Sẽ tạo hãng mới (`value`). */
  NEW_BRAND: 'new_brand',
  /** Sẽ tạo dòng xe mới (`value`). */
  NEW_MODEL: 'new_model',
} as const;
export type VehicleDataIssueCode = (typeof VEHICLE_DATA_ISSUE)[keyof typeof VEHICLE_DATA_ISSUE];
export const VEHICLE_DATA_ISSUE_VALUES = Object.values(VEHICLE_DATA_ISSUE) as VehicleDataIssueCode[];

export const VEHICLE_DATA_ISSUE_LEVEL = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;
export type VehicleDataIssueLevel =
  (typeof VEHICLE_DATA_ISSUE_LEVEL)[keyof typeof VEHICLE_DATA_ISSUE_LEVEL];
export const VEHICLE_DATA_ISSUE_LEVEL_VALUES = Object.values(
  VEHICLE_DATA_ISSUE_LEVEL,
) as VehicleDataIssueLevel[];

/** Trường của một dòng file — tên trường trong `issue.field` và trong danh sách thay đổi. */
export const VEHICLE_DATA_FILE_FIELDS = [
  'id',
  'vehicleType',
  'brand',
  'model',
  'variant',
  'yearFrom',
  'yearTo',
  ...VEHICLE_DATA_SPEC_FIELDS,
  'featureKeys',
  'listPrice',
  ...VEHICLE_DATA_RENT_FIELDS,
  'status',
] as const;
export type VehicleDataFileField = (typeof VEHICLE_DATA_FILE_FIELDS)[number];

// ── Gợi ý cho chủ xe ───────────────────────────────────────────────────────────────────────────

export const RENT_SUGGESTION_RULES = {
  /** Số xe cùng dòng tối thiểu trên chợ để hiện "giá thực tế" (ít hơn thì một xe kéo lệch cả khoảng). */
  marketplaceMinSamples: 5,
  /** Năm sản xuất ± bao nhiêu thì coi là "cùng đời". */
  yearWindow: 3,
} as const;

/** Giá thuê tham khảo lấy từ đâu. */
export const RENT_REFERENCE_BASIS = {
  /** Đúng xe chuẩn chủ xe chọn. */
  RECORD: 'record',
  /** Trung vị các xe chuẩn của cùng dòng (chưa chọn phiên bản, hoặc phiên bản thiếu giá). */
  MODEL: 'model',
} as const;
export type RentReferenceBasis = (typeof RENT_REFERENCE_BASIS)[keyof typeof RENT_REFERENCE_BASIS];
export const RENT_REFERENCE_BASIS_VALUES = Object.values(
  RENT_REFERENCE_BASIS,
) as RentReferenceBasis[];

/**
 * Khấu hao để suy GIÁ TRỊ XE từ giá bán xe mới (ADR 0090): năm đầu −10%, mỗi năm sau −4%, không thấp
 * hơn 30%. Là ước lượng THAM KHẢO — chủ xe quyết.
 *
 * Hiệu chỉnh 11/11/2026 theo giá rao xe cũ tháng 8/2026 (Chợ Tốt, Bonbanh): Vios 4 năm ≈ 76%,
 * 6 năm ≈ 66%, 8 năm ≈ 60%; Xpander 4 năm ≈ 81%, 7 năm ≈ 70% giá mới. Bộ đầu (−15% rồi −8%/năm)
 * cho 61% / 45% / 30% — hạ giá trị bảo hiểm quá tay.
 */
export const CATALOG_VALUE_DEPRECIATION = {
  firstYearPercent: 10,
  perYearPercent: 4,
  floorPercent: 30,
} as const;

/** % giá bán mới còn lại sau `age` năm (tuổi 0 ⇒ 100). */
export function catalogResidualPercent(age: number): number {
  if (age <= 0) return 100;
  const { firstYearPercent, perYearPercent, floorPercent } = CATALOG_VALUE_DEPRECIATION;
  return Math.max(floorPercent, 100 - firstYearPercent - (age - 1) * perYearPercent);
}

export interface CatalogValueEstimate {
  /** Bội 1.000.000đ, nằm trong khoảng giá trị bảo hiểm nhận. */
  amount: string;
  /** Tuổi xe đã dùng để khấu hao (năm hiện tại − năm sản xuất). */
  age: number;
  /** % giá bán mới còn lại. */
  residualPercent: number;
}

/**
 * Giá trị xe tham khảo = giá bán mới × % còn lại theo tuổi xe, làm tròn tới bội 1 triệu, kẹp trong
 * khoảng giá trị bảo hiểm nhận. Không biết năm sản xuất ⇒ coi như xe mới. Tính bằng BigInt trên
 * chuỗi VND — không bao giờ qua `number` (ADR 0007).
 */
export function estimateCatalogValue(
  listPrice: string | null | undefined,
  vehicleYear: number | null | undefined,
  currentYear: number,
): CatalogValueEstimate | null {
  if (!listPrice || !/^\d{1,15}$/.test(listPrice)) return null;
  const age = vehicleYear != null ? Math.max(0, currentYear - vehicleYear) : 0;
  const residualPercent = catalogResidualPercent(age);
  const raw = (BigInt(listPrice) * BigInt(residualPercent)) / 100n;
  return { amount: snapInsuredValue(raw), age, residualPercent };
}

function snapInsuredValue(amount: bigint): string {
  const step = BigInt(INSURANCE_VALUE_TIER_LIMITS.insuredValueStep);
  const min = BigInt(INSURANCE_VALUE_TIER_LIMITS.insuredValueMin);
  const max = BigInt(INSURANCE_VALUE_TIER_LIMITS.insuredValueMax);
  let rounded = ((amount + step / 2n) / step) * step;
  if (rounded < min) rounded = min;
  if (rounded > max) rounded = max;
  return rounded.toString();
}

/**
 * Phân vị trên một mảng ĐÃ SẮP tăng dần (nội suy tuyến tính, như `percentile_cont`), làm tròn
 * tới 1.000đ — đây là con số HIỂN THỊ cho chủ xe tham khảo, không phải một dòng tiền.
 */
export function rentPercentile(sorted: readonly number[], fraction: number): string | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * fraction;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const value = sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  return (Math.round(value / 1000) * 1000).toString();
}
