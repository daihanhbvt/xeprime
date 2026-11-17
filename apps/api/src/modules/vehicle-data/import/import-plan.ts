import {
  CATALOG_REVIEW_STATUS,
  VEHICLE_DATA_ISSUE as ISSUE,
  VEHICLE_DATA_ISSUE_LEVEL as LEVEL,
  VEHICLE_DATA_LIMITS,
  VEHICLE_DATA_ROW_ACTION as ACTION,
  VEHICLE_DATA_STATUS,
  catalogModelKey,
  catalogVariantKey,
  type VehicleDataFileField,
  type VehicleDataIssueCode,
  type VehicleDataIssueLevel,
  type VehicleDataRowAction,
} from '@xeprime/types';
import {
  normalizeFields,
  vehicleDataSpecIssue,
  type VehicleDataFields,
} from '../vehicle-data.service';
import {
  cellOf,
  findHeader,
  nameToken,
  parseBodyType,
  parseDecimalCell,
  parseFeatures,
  parseFuelType,
  parseIntCell,
  parseStatus,
  parseTransmission,
  parseVehicleType,
  parseVnd,
} from './columns';
import type { Sheet } from './spreadsheet';

// ── Dữ liệu vào ────────────────────────────────────────────────────────────────────────────────

/** Một dòng file đã tách ô theo trường (chuỗi thô, đã trim). Lưu nguyên ở bản xem trước. */
export interface RawRow {
  sheet: string;
  rowNumber: number;
  cells: Partial<Record<VehicleDataFileField, string>>;
}

export interface ParsedFile {
  rows: RawRow[];
  sheetsRead: string[];
  unknownColumns: string[];
}

/** Đọc mọi sheet có dòng tiêu đề khớp; sheet khác (hướng dẫn, ghi chú) bỏ qua. */
export function parseSheets(sheets: Sheet[]): ParsedFile {
  const rows: RawRow[] = [];
  const sheetsRead: string[] = [];
  const unknown = new Set<string>();
  for (const sheet of sheets) {
    const header = findHeader(sheet);
    if (!header) continue;
    sheetsRead.push(sheet.name);
    header.unknown.forEach((u) => unknown.add(u));
    for (const row of sheet.rows) {
      if (row.rowNumber <= header.headerRow) continue;
      const cells: Partial<Record<VehicleDataFileField, string>> = {};
      for (const field of Object.keys(header.columns) as VehicleDataFileField[]) {
        const value = cellOf(row, header, field);
        if (value) cells[field] = value;
      }
      if (Object.keys(cells).length > 0) {
        rows.push({ sheet: sheet.name, rowNumber: row.rowNumber, cells });
      }
    }
  }
  return { rows, sheetsRead, unknownColumns: [...unknown] };
}

// ── Ảnh chụp dữ liệu hiện có ───────────────────────────────────────────────────────────────────

export interface SnapshotRecord {
  id: string;
  modelId: string;
  key: string;
  label: string;
  yearFrom: number | null;
  yearTo: number | null;
  active: boolean;
  reviewStatus: string;
  fields: VehicleDataFields;
}

export interface SnapshotModel {
  id: string;
  brandKey: string;
  vehicleType: string;
  label: string;
}

export interface VehicleDataSnapshot {
  brands: Array<{ key: string; label: string; vehicleTypes: string[] }>;
  models: SnapshotModel[];
  records: SnapshotRecord[];
  /** Mã danh mục dùng được theo loại xe: `bodyType:sedan` → vehicleTypes ([] = mọi loại). */
  catalogValues: Map<string, string[]>;
}

// ── Kết quả ────────────────────────────────────────────────────────────────────────────────────

export interface ImportIssue {
  level: VehicleDataIssueLevel;
  code: VehicleDataIssueCode;
  field: VehicleDataFileField | null;
  value: string | null;
}

export interface ImportChange {
  field: VehicleDataFileField;
  before: string | null;
  after: string | null;
}

export interface ImportRowResult {
  sheet: string;
  rowNumber: number;
  action: VehicleDataRowAction;
  title: string;
  recordId: string | null;
  issues: ImportIssue[];
  changes: ImportChange[];
}

export interface ImportSummary {
  rowsTotal: number;
  rowsCreate: number;
  rowsUpdate: number;
  rowsUnchanged: number;
  rowsError: number;
  rowsWarning: number;
  newBrands: number;
  newModels: number;
  unknownColumns: string[];
}

/** Việc cần ghi — bộ thực thi đi qua đúng các service writer (CatalogService, VehicleDataService). */
export type ImportOp =
  | { type: 'brand'; key: string; label: string; vehicleType: string }
  | { type: 'model'; ref: string; brandKey: string; vehicleType: string; label: string }
  | {
      type: 'record';
      rowIndex: number;
      existingId: string | null;
      /** Id dòng xe thật, hoặc `ref` của một dòng xe tạo mới ở op 'model' trước đó. */
      modelRef: string;
      label: string;
      yearFrom: number | null;
      yearTo: number | null;
      fields: VehicleDataFields;
      active: boolean | null;
    };

export interface ImportPlan {
  results: ImportRowResult[];
  ops: ImportOp[];
  summary: ImportSummary;
}

const FIELD_ORDER: readonly (keyof VehicleDataFields)[] = [
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
  'featureKeys',
  'listPrice',
  'hourlyPrice',
  'weekdayPrice',
  'weekendPrice',
  'monthlyPrice',
  'withDriverDailyPrice',
];

const INT_FIELDS: Partial<Record<keyof VehicleDataFields, [number, number]>> = {
  seatCount: [1, 64],
  engineDisplacementCc: [1, 30000],
  horsepowerHp: [1, 5000],
  lengthMm: [1, 30000],
  widthMm: [1, 10000],
  heightMm: [1, 10000],
  curbWeightKg: [1, 100000],
  electricRangeKm: [1, 5000],
};
const DECIMAL_FIELDS: Partial<Record<keyof VehicleDataFields, number>> = {
  fuelConsumptionCombined: 99.99,
  batteryCapacityKwh: 9999.99,
};
const MONEY_FIELDS = [
  'listPrice',
  'hourlyPrice',
  'weekdayPrice',
  'weekendPrice',
  'monthlyPrice',
  'withDriverDailyPrice',
] as const;

/**
 * Lập kế hoạch cho MỘT lượt nhập — thuần, không chạm DB: xem trước và áp dụng gọi cùng hàm này
 * (áp dụng chạy lại trên ảnh chụp mới nhất, nên dữ liệu đổi giữa hai bước không bị ghi đè mù).
 *
 * Luật: ô trống = giữ nguyên (tạo mới ⇒ để trống); không bao giờ xoá qua file; dòng lỗi bỏ qua,
 * dòng khác vẫn áp dụng; cột "Mã" khớp đúng xe chuẩn (đổi tên/đời được), không có Mã thì khớp theo
 * (loại xe · hãng · dòng · phiên bản · năm từ).
 */
export function planImport(file: ParsedFile, snapshot: VehicleDataSnapshot): ImportPlan {
  const results: ImportRowResult[] = [];
  const ops: ImportOp[] = [];
  const brandsByToken = new Map(snapshot.brands.map((b) => [nameToken(b.label), b]));
  for (const b of snapshot.brands) brandsByToken.set(nameToken(b.key), b);
  const modelsByIdentity = new Map(
    snapshot.models.map((m) => [`${m.vehicleType}|${m.brandKey}|${nameToken(m.label)}`, m]),
  );
  const modelById = new Map(snapshot.models.map((m) => [m.id, m]));
  const recordById = new Map(snapshot.records.map((r) => [r.id, r]));
  const recordByIdentity = new Map(
    snapshot.records.map((r) => [identityKey(r.modelId, r.key, r.yearFrom), r]),
  );
  const newBrands = new Map<string, { key: string; label: string; vehicleType: string }>();
  const newModels = new Map<string, SnapshotModel>();
  /** Nhận dạng đã gặp trong file ⇒ số dòng đầu tiên. */
  const seen = new Map<string, number>();
  let modelSeq = 0;

  file.rows.forEach((raw, rowIndex) => {
    const cell = (f: VehicleDataFileField) => raw.cells[f] ?? '';
    const issues: ImportIssue[] = [];
    const add = (
      level: VehicleDataIssueLevel,
      code: VehicleDataIssueCode,
      field: VehicleDataFileField | null,
      value: string | null = null,
    ) => issues.push({ level, code, field, value });
    const title = [
      cell('brand'),
      cell('model'),
      cell('variant'),
      yearsText(cell('yearFrom'), cell('yearTo')),
    ]
      .filter(Boolean)
      .join(' · ');
    const finish = (
      action: VehicleDataRowAction,
      recordId: string | null,
      changes: ImportChange[] = [],
    ) =>
      results.push({
        sheet: raw.sheet,
        rowNumber: raw.rowNumber,
        action,
        title: title || `#${raw.rowNumber}`,
        recordId,
        issues,
        changes,
      });
    const failed = () => issues.some((i) => i.level === LEVEL.ERROR);

    // 1. Xe chuẩn đích theo Mã (nếu có).
    const idCell = cell('id');
    const byId = idCell ? recordById.get(idCell) : undefined;
    if (idCell && !byId) add(LEVEL.ERROR, ISSUE.ID_NOT_FOUND, 'id', idCell);
    const byIdModel = byId ? modelById.get(byId.modelId) : undefined;

    // 2. Loại xe · hãng · dòng xe.
    let vehicleType: string | null = byIdModel?.vehicleType ?? null;
    if (cell('vehicleType')) {
      const parsed = parseVehicleType(cell('vehicleType'));
      if (parsed === false)
        add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'vehicleType', cell('vehicleType'));
      else if (parsed) vehicleType = parsed;
    }
    if (!vehicleType && !failed()) add(LEVEL.ERROR, ISSUE.REQUIRED, 'vehicleType');
    if (!cell('brand') && !byId) add(LEVEL.ERROR, ISSUE.REQUIRED, 'brand');
    if (!cell('model') && !byId) add(LEVEL.ERROR, ISSUE.REQUIRED, 'model');
    if (failed() || !vehicleType) return finish(ACTION.ERROR, byId?.id ?? null);

    let brandKey = byIdModel?.brandKey ?? null;
    if (cell('brand')) {
      const token = nameToken(cell('brand'));
      const known = brandsByToken.get(token) ?? newBrands.get(token);
      if (known) {
        brandKey = known.key;
      } else {
        const key = slug(cell('brand'));
        if (!key) {
          add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'brand', cell('brand'));
          return finish(ACTION.ERROR, byId?.id ?? null);
        }
        brandKey = key;
        newBrands.set(token, { key, label: cell('brand'), vehicleType });
        ops.push({ type: 'brand', key, label: cell('brand'), vehicleType });
        add(LEVEL.INFO, ISSUE.NEW_BRAND, 'brand', cell('brand'));
      }
    }

    let modelRef: string | null = byIdModel?.id ?? null;
    let modelLabel = byIdModel?.label ?? '';
    if (cell('model') || (byIdModel && (cell('brand') || cell('vehicleType')))) {
      const label = cell('model') || modelLabel;
      const identity = `${vehicleType}|${brandKey}|${nameToken(label)}`;
      const known = modelsByIdentity.get(identity) ?? newModels.get(identity);
      if (known) {
        modelRef = known.id;
        modelLabel = known.label;
      } else {
        if (!catalogModelKey(brandKey!, label)) {
          add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'model', label);
          return finish(ACTION.ERROR, byId?.id ?? null);
        }
        modelSeq += 1;
        const ref = `new-model-${modelSeq}`;
        const created = { id: ref, brandKey: brandKey!, vehicleType, label };
        newModels.set(identity, created);
        ops.push({ type: 'model', ref, brandKey: brandKey!, vehicleType, label });
        add(LEVEL.INFO, ISSUE.NEW_MODEL, 'model', label);
        modelRef = ref;
        modelLabel = label;
      }
    }
    if (!modelRef) return finish(ACTION.ERROR, byId?.id ?? null);

    // 3. Phiên bản + đời.
    const label = cell('variant')
      ? cell('variant').slice(0, VEHICLE_DATA_LIMITS.labelMax)
      : (byId?.label ?? '');
    if (cell('variant') && !catalogVariantKey(cell('variant'))) {
      add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'variant', cell('variant'));
    }
    const year = (f: 'yearFrom' | 'yearTo', current: number | null) => {
      if (!cell(f)) return current;
      const v = parseIntCell(cell(f), VEHICLE_DATA_LIMITS.yearMin, VEHICLE_DATA_LIMITS.yearMax);
      if (v === false) {
        add(LEVEL.ERROR, ISSUE.INVALID_NUMBER, f, cell(f));
        return current;
      }
      return v;
    };
    const yearFrom = year('yearFrom', byId?.yearFrom ?? null);
    const yearTo = year('yearTo', byId?.yearTo ?? null);
    if (yearFrom != null && yearTo != null && yearTo < yearFrom) {
      add(LEVEL.ERROR, ISSUE.YEAR_RANGE, 'yearTo', cell('yearTo'));
    }
    const key = catalogVariantKey(label);
    const identity = identityKey(modelRef, key, yearFrom);
    const byIdentity = recordByIdentity.get(identity);
    const existing = byId ?? byIdentity ?? null;
    if (byId && byIdentity && byIdentity.id !== byId.id) {
      add(LEVEL.ERROR, ISSUE.IDENTITY_TAKEN, 'variant', titleOf(modelLabel, byIdentity));
    }
    const firstRow = seen.get(identity);
    if (firstRow !== undefined) add(LEVEL.ERROR, ISSUE.DUPLICATE_ROW, null, String(firstRow));
    if (failed()) return finish(ACTION.ERROR, existing?.id ?? null);
    seen.set(identity, raw.rowNumber);

    // 4. Thông số, tiện ích, giá: ô trống = giữ nguyên.
    const base = existing?.fields ?? emptyFields();
    const fields: VehicleDataFields = { ...base, featureKeys: [...base.featureKeys] };
    for (const [field, range] of Object.entries(INT_FIELDS) as Array<
      [keyof VehicleDataFields, [number, number]]
    >) {
      const text = cell(field as VehicleDataFileField);
      if (!text) continue;
      const v = parseIntCell(text, range[0], range[1]);
      if (v === false) add(LEVEL.ERROR, ISSUE.INVALID_NUMBER, field as VehicleDataFileField, text);
      else (fields as unknown as Record<string, unknown>)[field] = v;
    }
    for (const [field, max] of Object.entries(DECIMAL_FIELDS) as Array<
      [keyof VehicleDataFields, number]
    >) {
      const text = cell(field as VehicleDataFileField);
      if (!text) continue;
      const v = parseDecimalCell(text, max);
      if (v === false) add(LEVEL.ERROR, ISSUE.INVALID_NUMBER, field as VehicleDataFileField, text);
      else (fields as unknown as Record<string, unknown>)[field] = v;
    }
    for (const field of MONEY_FIELDS) {
      const text = cell(field);
      if (!text) continue;
      const v = parseVnd(text);
      if (v === false || (v && BigInt(v) > BigInt(VEHICLE_DATA_LIMITS.priceMax))) {
        add(LEVEL.ERROR, ISSUE.INVALID_NUMBER, field, text);
      } else fields[field] = v;
    }
    const enumField = (
      field: 'fuelType' | 'transmission' | 'bodyType',
      parse: (raw: string) => string | null | false,
    ) => {
      const text = cell(field);
      if (!text) return;
      const v = parse(text);
      if (v === false) add(LEVEL.ERROR, ISSUE.INVALID_VALUE, field, text);
      else fields[field] = v;
    };
    enumField('fuelType', parseFuelType);
    enumField('transmission', parseTransmission);
    enumField('bodyType', parseBodyType);
    if (cell('featureKeys')) {
      const { keys, unknown } = parseFeatures(cell('featureKeys'));
      const allowed = keys.filter((k) =>
        catalogAllows(snapshot, 'vehicle_feature', k, vehicleType),
      );
      const notForType = keys.filter((k) => !allowed.includes(k));
      for (const u of [...unknown, ...notForType])
        add(LEVEL.WARNING, ISSUE.UNKNOWN_FEATURE, 'featureKeys', u);
      fields.featureKeys = allowed;
    }
    if (fields.bodyType && !catalogAllows(snapshot, 'body_type', fields.bodyType, vehicleType)) {
      add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'bodyType', cell('bodyType') || fields.bodyType);
    }
    if (fields.fuelType && !catalogAllows(snapshot, 'fuel_type', fields.fuelType, vehicleType)) {
      add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'fuelType', cell('fuelType') || fields.fuelType);
    }
    const specIssue = vehicleDataSpecIssue(vehicleType, { ...fields, yearFrom, yearTo });
    if (specIssue) add(LEVEL.ERROR, ISSUE.INVALID_SPEC, null, specIssue);

    // 5. Trạng thái: chỉ Đang gợi ý / Ẩn; xe chờ duyệt thì bỏ qua (duyệt ở màn quản trị).
    let active: boolean | null = null;
    if (cell('status')) {
      const status = parseStatus(cell('status'));
      if (status === false) add(LEVEL.ERROR, ISSUE.INVALID_VALUE, 'status', cell('status'));
      else if (existing?.reviewStatus === CATALOG_REVIEW_STATUS.PENDING) {
        add(LEVEL.WARNING, ISSUE.STATUS_IGNORED, 'status', cell('status'));
      } else if (status === VEHICLE_DATA_STATUS.ACTIVE) active = true;
      else if (status === VEHICLE_DATA_STATUS.HIDDEN) active = false;
    }
    if (failed()) return finish(ACTION.ERROR, existing?.id ?? null);

    // 6. So với hiện có.
    const normalized = normalizeFields(fields);
    if (!existing) {
      ops.push({
        type: 'record',
        rowIndex,
        existingId: null,
        modelRef,
        label,
        yearFrom,
        yearTo,
        fields: normalized,
        active,
      });
      return finish(
        ACTION.CREATE,
        null,
        diff(null, { modelLabel, label, yearFrom, yearTo, fields: normalized }),
      );
    }
    const before = normalizeFields(existing.fields);
    const changes = diff(
      {
        modelLabel: modelById.get(existing.modelId)?.label ?? '',
        label: existing.label,
        yearFrom: existing.yearFrom,
        yearTo: existing.yearTo,
        fields: before,
        active: existing.active,
      },
      {
        modelLabel,
        label,
        yearFrom,
        yearTo,
        fields: normalized,
        active: active ?? existing.active,
      },
    );
    if (existing.modelId !== modelRef && !changes.some((c) => c.field === 'model')) {
      changes.unshift({
        field: 'model',
        before: modelById.get(existing.modelId)?.label ?? null,
        after: modelLabel,
      });
    }
    if (changes.length === 0) return finish(ACTION.UNCHANGED, existing.id);
    ops.push({
      type: 'record',
      rowIndex,
      existingId: existing.id,
      modelRef,
      label,
      yearFrom,
      yearTo,
      fields: normalized,
      active,
    });
    return finish(ACTION.UPDATE, existing.id, changes);
  });

  const count = (a: VehicleDataRowAction) => results.filter((r) => r.action === a).length;
  return {
    results,
    ops,
    summary: {
      rowsTotal: results.length,
      rowsCreate: count(ACTION.CREATE),
      rowsUpdate: count(ACTION.UPDATE),
      rowsUnchanged: count(ACTION.UNCHANGED),
      rowsError: count(ACTION.ERROR),
      rowsWarning: results.filter((r) => r.issues.some((i) => i.level === LEVEL.WARNING)).length,
      newBrands: newBrands.size,
      newModels: newModels.size,
      unknownColumns: file.unknownColumns,
    },
  };
}

// ── nội bộ ─────────────────────────────────────────────────────────────────────────────────────

function identityKey(modelId: string, key: string, yearFrom: number | null): string {
  return `${modelId}|${key}|${yearFrom ?? 0}`;
}

function emptyFields(): VehicleDataFields {
  return {
    seatCount: null,
    bodyType: null,
    fuelType: null,
    transmission: null,
    engineDisplacementCc: null,
    horsepowerHp: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    curbWeightKg: null,
    fuelConsumptionCombined: null,
    electricRangeKm: null,
    batteryCapacityKwh: null,
    featureKeys: [],
    listPrice: null,
    hourlyPrice: null,
    weekdayPrice: null,
    weekendPrice: null,
    monthlyPrice: null,
    withDriverDailyPrice: null,
  };
}

function catalogAllows(
  snapshot: VehicleDataSnapshot,
  type: 'body_type' | 'fuel_type' | 'vehicle_feature',
  key: string,
  vehicleType: string,
): boolean {
  const types = snapshot.catalogValues.get(`${type}:${key}`);
  if (!types) return false;
  return types.length === 0 || types.includes(vehicleType);
}

function slug(value: string): string {
  return catalogVariantKey(value);
}

function yearsText(from: string, to: string): string {
  if (!from && !to) return '';
  return to && to !== from ? `${from || '?'}-${to}` : from || to;
}

function titleOf(modelLabel: string, r: SnapshotRecord): string {
  return [modelLabel, r.label, r.yearFrom ?? ''].filter((v) => v !== '').join(' · ');
}

interface DiffSide {
  modelLabel: string;
  label: string;
  yearFrom: number | null;
  yearTo: number | null;
  fields: VehicleDataFields;
  active?: boolean;
}

/** Các ô đổi giữa bản hiện có và bản sau khi nhập — hiện ở bản xem trước "cũ → mới". */
function diff(before: DiffSide | null, after: DiffSide): ImportChange[] {
  const out: ImportChange[] = [];
  const push = (field: VehicleDataFileField, a: unknown, b: unknown) => {
    const sa = text(a);
    const sb = text(b);
    if (before ? sa !== sb : sb != null) out.push({ field, before: before ? sa : null, after: sb });
  };
  push('model', before?.modelLabel, after.modelLabel);
  push('variant', before?.label || null, after.label || null);
  push('yearFrom', before?.yearFrom, after.yearFrom);
  push('yearTo', before?.yearTo, after.yearTo);
  for (const field of FIELD_ORDER)
    push(field as VehicleDataFileField, before?.fields[field], after.fields[field]);
  if (before && after.active !== undefined) {
    push(
      'status',
      before.active ? VEHICLE_DATA_STATUS.ACTIVE : VEHICLE_DATA_STATUS.HIDDEN,
      after.active ? VEHICLE_DATA_STATUS.ACTIVE : VEHICLE_DATA_STATUS.HIDDEN,
    );
  }
  return out;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length ? [...value].sort().join(';') : null;
  return String(value);
}
