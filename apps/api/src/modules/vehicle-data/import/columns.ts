import {
  BODY_TYPE_LABEL,
  BODY_TYPE_VALUES,
  FUEL_TYPE_LABEL,
  FUEL_TYPE_VALUES,
  TRANSMISSION_TYPE_EXT,
  TRANSMISSION_TYPE_EXT_LABEL,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_DATA_STATUS,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_FEATURE_LABEL,
  VEHICLE_TYPE,
  normalizeCatalogSearch,
  type VehicleDataFileField,
} from '@xeprime/types';
import type { Sheet, SheetRow } from './spreadsheet';

/**
 * Chuẩn hoá tên cột / giá trị chữ để so khớp: bỏ dấu, chữ thường, bỏ phần trong ngoặc (đơn vị),
 * gộp khoảng trắng, bỏ khoảng trắng quanh "/". "Giá bán mới (VNĐ)" ⇒ "gia ban moi".
 */
export function normalizeToken(value: string): string {
  return normalizeCatalogSearch(value.replace(/\([^)]*\)/g, ' '))
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9/+-]+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * MỘT định dạng file: mỗi dòng là một xe chuẩn với đủ thông tin. Tiêu đề in ở file mẫu là phần tử
 * đầu của mỗi mảng (kèm đơn vị trong ngoặc ở `FILE_HEADERS`); các phần tử sau là bí danh nhận thêm.
 */
export const FILE_COLUMNS: Readonly<Record<VehicleDataFileField, readonly string[]>> = {
  id: ['ma', 'ma xe chuan', 'id'],
  vehicleType: ['loai xe', 'vehicle type'],
  brand: ['hang', 'hang xe', 'brand'],
  model: ['dong xe', 'mau xe', 'mau', 'model'],
  variant: ['phien ban', 'variant', 'trim'],
  yearFrom: ['nam tu', 'doi tu', 'year from'],
  yearTo: ['nam den', 'doi den', 'year to'],
  seatCount: ['so cho', 'so cho ngoi', 'seats'],
  bodyType: ['kieu dang', 'body type'],
  fuelType: ['nhien lieu', 'nguon nang luong', 'fuel'],
  transmission: ['hop so', 'transmission'],
  engineDisplacementCc: ['dung tich', 'dung tich xi lanh', 'engine'],
  horsepowerHp: ['cong suat', 'horsepower'],
  lengthMm: ['dai', 'chieu dai', 'length'],
  widthMm: ['rong', 'chieu rong', 'width'],
  heightMm: ['cao', 'chieu cao', 'height'],
  curbWeightKg: ['trong luong', 'khoi luong', 'weight'],
  fuelConsumptionCombined: ['tieu hao', 'muc tieu hao', 'fuel consumption'],
  electricRangeKm: ['quang duong dien', 'tam hoat dong', 'electric range'],
  batteryCapacityKwh: ['pin', 'dung luong pin', 'battery'],
  featureKeys: ['tien ich', 'features'],
  listPrice: ['gia ban moi', 'gia ban', 'gia ban tham khao', 'gia niem yet', 'list price'],
  hourlyPrice: ['gia thue theo gio', 'gia thue/gio', 'gia gio', 'hourly price'],
  weekdayPrice: [
    'gia thue ngay thuong',
    'gia thue/ngay',
    'gia thue ngay',
    'gia ngay',
    'daily price',
  ],
  weekendPrice: ['gia thue cuoi tuan', 'gia cuoi tuan', 'weekend price'],
  monthlyPrice: ['gia thue theo thang', 'gia thue/thang', 'gia thang', 'monthly price'],
  withDriverDailyPrice: [
    'gia co tai xe/ngay',
    'gia co tai xe',
    'gia thue co tai xe/ngay',
    'with driver price',
  ],
  status: ['trang thai', 'status'],
};

/** Tiêu đề in ở file mẫu và file xuất — thứ tự là thứ tự cột. */
export const FILE_HEADERS: ReadonlyArray<{ field: VehicleDataFileField; header: string }> = [
  { field: 'id', header: 'Mã' },
  { field: 'vehicleType', header: 'Loại xe' },
  { field: 'brand', header: 'Hãng' },
  { field: 'model', header: 'Dòng xe' },
  { field: 'variant', header: 'Phiên bản' },
  { field: 'yearFrom', header: 'Năm từ' },
  { field: 'yearTo', header: 'Năm đến' },
  { field: 'seatCount', header: 'Số chỗ' },
  { field: 'bodyType', header: 'Kiểu dáng' },
  { field: 'fuelType', header: 'Nhiên liệu' },
  { field: 'transmission', header: 'Hộp số' },
  { field: 'engineDisplacementCc', header: 'Dung tích (cc)' },
  { field: 'horsepowerHp', header: 'Công suất (hp)' },
  { field: 'lengthMm', header: 'Dài (mm)' },
  { field: 'widthMm', header: 'Rộng (mm)' },
  { field: 'heightMm', header: 'Cao (mm)' },
  { field: 'curbWeightKg', header: 'Trọng lượng (kg)' },
  { field: 'fuelConsumptionCombined', header: 'Tiêu hao (L/100km)' },
  { field: 'electricRangeKm', header: 'Quãng đường điện (km)' },
  { field: 'batteryCapacityKwh', header: 'Pin (kWh)' },
  { field: 'featureKeys', header: 'Tiện ích' },
  { field: 'listPrice', header: 'Giá bán mới (VNĐ)' },
  { field: 'hourlyPrice', header: 'Giá thuê theo giờ (VNĐ)' },
  { field: 'weekdayPrice', header: 'Giá thuê ngày thường (VNĐ)' },
  { field: 'weekendPrice', header: 'Giá thuê cuối tuần (VNĐ)' },
  { field: 'monthlyPrice', header: 'Giá thuê theo tháng (VNĐ)' },
  { field: 'withDriverDailyPrice', header: 'Giá có tài xế / ngày (VNĐ)' },
  { field: 'status', header: 'Trạng thái' },
];

/** Cột bắt buộc để nhận ra một sheet là bảng Dữ liệu xe. */
export const REQUIRED_COLUMNS: readonly VehicleDataFileField[] = ['vehicleType', 'brand', 'model'];

export interface HeaderMap {
  headerRow: number;
  columns: Partial<Record<VehicleDataFileField, number>>;
  unknown: string[];
}

/**
 * Tìm dòng tiêu đề trong 10 dòng đầu: dòng đầu tiên khớp đủ cột bắt buộc. Sheet không có dòng nào
 * như vậy ⇒ không phải bảng dữ liệu (sheet hướng dẫn, ghi chú…).
 */
export function findHeader(sheet: Sheet): HeaderMap | null {
  const lookup = new Map<string, VehicleDataFileField>();
  for (const [field, names] of Object.entries(FILE_COLUMNS) as Array<
    [VehicleDataFileField, readonly string[]]
  >) {
    for (const name of names) lookup.set(name, field);
  }
  for (const row of sheet.rows.slice(0, 10)) {
    const columns: Partial<Record<VehicleDataFileField, number>> = {};
    const unknown: string[] = [];
    row.cells.forEach((cell, index) => {
      const token = normalizeToken(cell);
      if (!token) return;
      const field = lookup.get(token);
      if (field && columns[field] === undefined) columns[field] = index;
      else if (!field && token !== 'stt') unknown.push(cell.trim());
    });
    if (REQUIRED_COLUMNS.every((field) => columns[field] !== undefined)) {
      return { headerRow: row.rowNumber, columns, unknown };
    }
  }
  return null;
}

export function cellOf(row: SheetRow, header: HeaderMap, field: VehicleDataFileField): string {
  const index = header.columns[field];
  return index === undefined ? '' : (row.cells[index] ?? '').trim();
}

// ── Đọc giá trị ────────────────────────────────────────────────────────────────────────────────

/**
 * Số tiền VND nguyên: "800000", "800.000", "800,000", "800000.0". Trả null khi trống, `false` khi
 * không đọc được. Không nhận số lẻ — giá luôn là đồng nguyên.
 */
export function parseVnd(raw: string): string | null | false {
  const value = raw.replace(/\s|đ|₫|vnđ|vnd/gi, '');
  if (!value) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(value)) {
    return value.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
  }
  const m = /^(\d+)([.,]0+)?$/.exec(value);
  if (!m) return false;
  const digits = m[1]!.replace(/^0+(?=\d)/, '');
  if (digits === '0') return false;
  return digits.length > 12 ? false : digits;
}

export function parseIntCell(raw: string, min: number, max: number): number | null | false {
  const value = raw.replace(/\s/g, '').replace(/[.,]0+$/, '');
  if (!value) return null;
  if (!/^\d+$/.test(value.replace(/[.,](?=\d{3}\b)/g, ''))) return false;
  const n = Number(value.replace(/[.,]/g, ''));
  return Number.isInteger(n) && n >= min && n <= max ? n : false;
}

/** Số thập phân tới 2 chữ số, nhận dấu phẩy kiểu Việt: "5,7" ⇒ "5.7". */
export function parseDecimalCell(raw: string, max: number): string | null | false {
  const value = raw.replace(/\s/g, '').replace(',', '.');
  if (!value) return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  if (!(n > 0) || n > max) return false;
  return String(Math.round(n * 100) / 100);
}

/** Bảng tra mã ← {mã, nhãn tiếng Việt, bí danh} đã chuẩn hoá. */
function enumLookup(
  codes: readonly string[],
  labels: Readonly<Record<string, string>>,
  aliases: Readonly<Record<string, string>> = {},
): (raw: string) => string | null | false {
  const map = new Map<string, string>();
  for (const code of codes) {
    map.set(normalizeToken(code), code);
    map.set(normalizeToken(code.replace(/_/g, ' ')), code);
    const label = labels[code];
    if (label) map.set(normalizeToken(label), code);
  }
  for (const [alias, code] of Object.entries(aliases)) map.set(normalizeToken(alias), code);
  return (raw) => {
    const token = normalizeToken(raw);
    if (!token) return null;
    return map.get(token) ?? false;
  };
}

export const VEHICLE_TYPE_FILE_LABEL: Readonly<Record<string, string>> = {
  [VEHICLE_TYPE.CAR]: 'Ô tô',
  [VEHICLE_TYPE.MOTORBIKE]: 'Xe máy',
};

export const parseVehicleType = enumLookup(
  [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  VEHICLE_TYPE_FILE_LABEL,
  { oto: VEHICLE_TYPE.CAR, 'xe hoi': VEHICLE_TYPE.CAR, moto: VEHICLE_TYPE.MOTORBIKE },
);

export const parseFuelType = enumLookup(FUEL_TYPE_VALUES, FUEL_TYPE_LABEL, {
  xang: 'gasoline',
  'xang dau': 'gasoline',
  dau: 'diesel',
  'may dau': 'diesel',
  dien: 'electric',
  ev: 'electric',
  hev: 'hybrid',
  phev: 'plug_in_hybrid',
  'plug-in hybrid': 'plug_in_hybrid',
});

export const parseTransmission = enumLookup(
  TRANSMISSION_TYPE_EXT_VALUES,
  TRANSMISSION_TYPE_EXT_LABEL,
  {
    at: TRANSMISSION_TYPE_EXT.AUTOMATIC,
    'so tu dong': TRANSMISSION_TYPE_EXT.AUTOMATIC,
    'tu dong': TRANSMISSION_TYPE_EXT.AUTOMATIC,
    mt: TRANSMISSION_TYPE_EXT.MANUAL,
    'so san': TRANSMISSION_TYPE_EXT.MANUAL,
    'e-cvt': TRANSMISSION_TYPE_EXT.E_CVT,
    ecvt: TRANSMISSION_TYPE_EXT.E_CVT,
    '1 cap': TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    'tay ga': TRANSMISSION_TYPE_EXT.AUTOMATIC_CVT,
    'xe so': TRANSMISSION_TYPE_EXT.SEMI_AUTOMATIC,
    'con tay': TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH,
  },
);

export const parseBodyType = enumLookup(BODY_TYPE_VALUES, BODY_TYPE_LABEL, {
  hatchback: 'mini',
  'ban tai': 'pickup',
});

/** Trạng thái: "Đang gợi ý" / "Ẩn" (+ mã). Trống ⇒ giữ nguyên (tạo mới ⇒ đang gợi ý). */
export const STATUS_FILE_LABEL: Readonly<Record<string, string>> = {
  [VEHICLE_DATA_STATUS.ACTIVE]: 'Đang gợi ý',
  [VEHICLE_DATA_STATUS.HIDDEN]: 'Ẩn',
  [VEHICLE_DATA_STATUS.PENDING]: 'Chờ duyệt',
};

export const parseStatus = enumLookup(
  [VEHICLE_DATA_STATUS.ACTIVE, VEHICLE_DATA_STATUS.HIDDEN, VEHICLE_DATA_STATUS.PENDING],
  STATUS_FILE_LABEL,
  {
    hien: VEHICLE_DATA_STATUS.ACTIVE,
    'dang hien': VEHICLE_DATA_STATUS.ACTIVE,
    an: VEHICLE_DATA_STATUS.HIDDEN,
  },
);

const featureLookup = enumLookup(VEHICLE_FEATURE_KEYS, VEHICLE_FEATURE_LABEL);

/** Danh sách tiện ích "Camera 360; Cảm biến lùi | etc" ⇒ mã đã biết + phần không nhận ra. */
export function parseFeatures(raw: string): { keys: string[]; unknown: string[] } {
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const part of raw.split(/[;|,\n]/)) {
    const value = part.trim();
    if (!value) continue;
    const code = featureLookup(value);
    if (code) {
      if (!keys.includes(code)) keys.push(code);
    } else unknown.push(value);
  }
  return { keys, unknown };
}

/** Khoá so khớp tên (hãng, dòng xe) không phân biệt hoa thường/dấu/khoảng trắng. */
export function nameToken(value: string): string {
  return normalizeCatalogSearch(value).replace(/[^a-z0-9]+/g, '');
}
