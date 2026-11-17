import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, type Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BODY_TYPE_LABEL,
  BODY_TYPE_VALUES,
  CATALOG_ORIGIN,
  CATALOG_TYPE,
  FUEL_TYPE_LABEL,
  FUEL_TYPE_VALUES,
  TRANSMISSION_TYPE_EXT_LABEL,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_DATA_IMPORT_LIMITS as LIMITS,
  VEHICLE_DATA_IMPORT_STATUS,
  VEHICLE_DATA_ISSUE_LEVEL,
  VEHICLE_DATA_ORIGIN,
  VEHICLE_DATA_ROW_ACTION,
  VEHICLE_DATA_STATUS,
  VEHICLE_FEATURE_LABEL,
  VEHICLE_TYPE,
  vehicleDataStatus,
  type VehicleFeatureKey,
} from '@xeprime/types';
import { Workbook, type Worksheet } from 'exceljs';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import {
  VEHICLE_DATA_DEFAULT_LIMIT,
  VEHICLE_DATA_MAX_LIMIT,
  type VehicleDataImportDto,
  type VehicleDataImportListQueryDto,
  type VehicleDataImportPageDto,
  type VehicleDataImportRowPageDto,
  type VehicleDataImportRowsQueryDto,
  type VehicleDataImportSummaryDto,
  type VehicleDataListQueryDto,
} from './dto/vehicle-data.dto';
import { FILE_HEADERS, STATUS_FILE_LABEL, VEHICLE_TYPE_FILE_LABEL } from './import/columns';
import {
  parseSheets,
  planImport,
  type ImportPlan,
  type ImportRowResult,
  type ParsedFile,
  type VehicleDataSnapshot,
} from './import/import-plan';
import { readSpreadsheet, SpreadsheetError } from './import/spreadsheet';
import { VehicleDataQueryService } from './vehicle-data-query.service';
import { RECORD_SELECT, recordFields, VehicleDataService } from './vehicle-data.service';

type Tx = Prisma.TransactionClient;

/** Nội dung `rows_json` của một lượt nhập: dòng thô (để lập lại kế hoạch) + kết quả từng dòng. */
interface StoredRows {
  file: ParsedFile;
  results: ImportRowResult[];
}

/** Trần dòng một lượt xuất — cả kho dữ liệu xe hiện tại chỉ vài nghìn dòng. */
const EXPORT_MAX_ROWS = 20_000;
/** Áp dụng một file 5.000 dòng là vài chục nghìn câu lệnh trong MỘT transaction. */
const APPLY_TIMEOUT_MS = 10 * 60 * 1000;
/** Số dòng có ô chọn sẵn (thả xuống) ở file mẫu. */
const TEMPLATE_VALIDATION_ROWS = 5000;

/**
 * Nhập / xuất file Dữ liệu xe (ADR 0090). Tải lên chỉ PHÂN TÍCH và lưu bản xem trước; áp dụng lập
 * lại kế hoạch trên dữ liệu hiện tại rồi ghi trong MỘT transaction qua đúng các writer
 * (`CatalogService` cho hãng, `VehicleDataService` cho dòng xe + xe chuẩn). File xuất có đúng định
 * dạng file nhập — sửa trong Excel rồi tải lên lại là vô hại.
 */
@Injectable()
export class VehicleDataImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly vehicleData: VehicleDataService,
    private readonly query: VehicleDataQueryService,
  ) {}

  async preview(
    actorUserId: string,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ): Promise<VehicleDataImportDto> {
    if (!file?.buffer?.length) throw this.fileInvalid('Chưa chọn file');
    if (file.size > LIMITS.maxBytes) throw this.fileInvalid('File lớn hơn 5 MB');
    let parsed: ParsedFile;
    try {
      parsed = parseSheets(await readSpreadsheet(file.buffer, LIMITS.maxRows));
    } catch (error) {
      if (error instanceof SpreadsheetError) throw this.fileInvalid(error.message);
      throw error;
    }
    if (parsed.sheetsRead.length === 0) {
      throw this.fileInvalid('Không thấy bảng có cột "Loại xe", "Hãng", "Dòng xe"');
    }
    if (parsed.rows.length === 0) throw this.fileInvalid('File không có dòng dữ liệu nào');
    if (parsed.rows.length > LIMITS.maxRows) {
      throw this.fileInvalid(`File có hơn ${LIMITS.maxRows} dòng - chia nhỏ rồi tải lên lần lượt`);
    }

    const plan = planImport(parsed, await this.snapshot(this.prisma));
    const id = newId();
    const rows: StoredRows = { file: parsed, results: plan.results };
    await this.prisma.vehicleCatalogImport.create({
      data: {
        id,
        status: VEHICLE_DATA_IMPORT_STATUS.PREVIEWED,
        fileName: sanitizeFileName(file.originalname),
        rowCount: parsed.rows.length,
        summaryJson: plan.summary as unknown as Prisma.InputJsonValue,
        rowsJson: rows as unknown as Prisma.InputJsonValue,
        createdBy: actorUserId,
      },
    });
    return this.get(id);
  }

  async list(query: VehicleDataImportListQueryDto): Promise<VehicleDataImportPageDto> {
    const paging = resolvePaging(query, 10, VEHICLE_DATA_MAX_LIMIT);
    const [total, rows] = await Promise.all([
      this.prisma.vehicleCatalogImport.count(),
      this.prisma.vehicleCatalogImport.findMany({
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: IMPORT_SELECT,
      }),
    ]);
    const names = await this.userNames(rows.flatMap((r) => [r.createdBy, r.appliedBy]));
    return { data: rows.map((r) => toImportDto(r, names)), meta: paginationMeta(paging, total) };
  }

  async get(id: string): Promise<VehicleDataImportDto> {
    const row = await this.prisma.vehicleCatalogImport.findUnique({
      where: { id },
      select: IMPORT_SELECT,
    });
    if (!row) throw new NotFoundException('Không tìm thấy lượt nhập file');
    const names = await this.userNames([row.createdBy, row.appliedBy]);
    return toImportDto(row, names);
  }

  /** Kết quả từng dòng (lọc theo việc / chỉ dòng có vấn đề), phân trang trong bộ nhớ (≤ 5.000 dòng). */
  async rows(
    id: string,
    query: VehicleDataImportRowsQueryDto,
  ): Promise<VehicleDataImportRowPageDto> {
    const row = await this.prisma.vehicleCatalogImport.findUnique({
      where: { id },
      select: { rowsJson: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lượt nhập file');
    const stored = row.rowsJson as unknown as StoredRows;
    let results = stored.results;
    if (query.action) results = results.filter((r) => r.action === query.action);
    if (query.withIssues) {
      results = results.filter((r) =>
        r.issues.some((i) => i.level !== VEHICLE_DATA_ISSUE_LEVEL.INFO),
      );
    }
    const paging = resolvePaging(query, VEHICLE_DATA_DEFAULT_LIMIT, VEHICLE_DATA_MAX_LIMIT);
    return {
      data: results.slice(paging.skip, paging.skip + paging.take),
      meta: paginationMeta(paging, results.length),
    };
  }

  /**
   * Áp dụng: lập lại kế hoạch trên dữ liệu HIỆN TẠI (ai đó có thể đã sửa giữa hai bước) rồi ghi
   * trong một transaction. Dòng lỗi bỏ qua; ghi hỏng giữa chừng thì không dòng nào được ghi.
   */
  async apply(actorUserId: string, id: string): Promise<VehicleDataImportDto> {
    await this.prisma.$transaction(
      async (tx) => {
        // Hai lượt áp dụng song song cùng tạo một dòng xe ⇒ tuần tự hoá mọi lượt nhập.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vehicle-data-import'))`;
        const current = await tx.vehicleCatalogImport.findUnique({
          where: { id },
          select: { status: true, createdAt: true, rowsJson: true },
        });
        if (!current) throw new NotFoundException('Không tìm thấy lượt nhập file');
        if (
          current.status !== VEHICLE_DATA_IMPORT_STATUS.PREVIEWED ||
          expiresAt(current.createdAt) < new Date()
        ) {
          throw this.notPending();
        }
        const stored = current.rowsJson as unknown as StoredRows;
        const snapshot = await this.snapshot(tx);
        const plan = planImport(stored.file, snapshot);
        const results = await this.execute(tx, actorUserId, plan, snapshot);
        await tx.vehicleCatalogImport.update({
          where: { id },
          data: {
            status: VEHICLE_DATA_IMPORT_STATUS.APPLIED,
            appliedAt: new Date(),
            appliedBy: actorUserId,
            summaryJson: plan.summary as unknown as Prisma.InputJsonValue,
            rowsJson: { file: stored.file, results } as unknown as Prisma.InputJsonValue,
          },
        });
        await this.audit.record(
          {
            actorUserId,
            actorScope: 'platform',
            action: 'vehicle_data.import.apply',
            targetType: 'vehicle_catalog_import',
            targetId: id,
            after: { ...plan.summary },
          },
          tx,
        );
      },
      { timeout: APPLY_TIMEOUT_MS, maxWait: 15_000 },
    );
    return this.get(id);
  }

  async discard(actorUserId: string, id: string): Promise<VehicleDataImportDto> {
    const updated = await this.prisma.vehicleCatalogImport.updateMany({
      where: { id, status: VEHICLE_DATA_IMPORT_STATUS.PREVIEWED },
      data: { status: VEHICLE_DATA_IMPORT_STATUS.DISCARDED, discardedAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.vehicleCatalogImport.count({ where: { id } });
      if (!exists) throw new NotFoundException('Không tìm thấy lượt nhập file');
      throw this.notPending();
    }
    await this.audit.record({
      actorUserId,
      actorScope: 'platform',
      action: 'vehicle_data.import.discard',
      targetType: 'vehicle_catalog_import',
      targetId: id,
    });
    return this.get(id);
  }

  // ── File mẫu + xuất ──────────────────────────────────────────────────────

  async template(): Promise<{ file: Buffer; fileName: string }> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(DATA_SHEET);
    writeHeader(sheet);
    for (const example of TEMPLATE_EXAMPLES)
      sheet.addRow(FILE_HEADERS.map((h) => example[h.field] ?? ''));
    addValidations(sheet);
    writeGuide(workbook);
    return {
      file: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: 'xeprime-mau-du-lieu-xe.xlsx',
    };
  }

  /** Dữ liệu xe theo đúng bộ lọc đang xem, đúng định dạng file nhập (có cột Mã để khớp lại). */
  async exportData(filter: VehicleDataListQueryDto): Promise<{ file: Buffer; fileName: string }> {
    const where = await this.query.buildWhere(filter);
    const [rows, brands] = await Promise.all([
      this.prisma.vehicleCatalogVariant.findMany({
        where,
        orderBy: [
          { model: { vehicleType: 'asc' } },
          { model: { brandKey: 'asc' } },
          { model: { label: 'asc' } },
          { label: 'asc' },
          { yearFrom: 'desc' },
        ],
        take: EXPORT_MAX_ROWS,
        select: {
          ...RECORD_SELECT,
          model: { select: { label: true, brandKey: true, vehicleType: true } },
        },
      }),
      this.prisma.catalogItem.findMany({
        where: { type: CATALOG_TYPE.VEHICLE_BRAND },
        select: { key: true, label: true },
      }),
    ]);
    const brandLabel = new Map(brands.map((b) => [b.key, b.label]));
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(DATA_SHEET);
    writeHeader(sheet);
    for (const row of rows) {
      const f = recordFields(row);
      const values: Record<string, string | number | null> = {
        id: row.id,
        vehicleType: VEHICLE_TYPE_FILE_LABEL[row.model.vehicleType] ?? row.model.vehicleType,
        brand: brandLabel.get(row.model.brandKey) ?? row.model.brandKey,
        model: row.model.label,
        variant: row.label,
        yearFrom: row.yearFrom,
        yearTo: row.yearTo,
        seatCount: f.seatCount,
        bodyType: f.bodyType
          ? ((BODY_TYPE_LABEL as Record<string, string>)[f.bodyType] ?? f.bodyType)
          : null,
        fuelType: f.fuelType
          ? ((FUEL_TYPE_LABEL as Record<string, string>)[f.fuelType] ?? f.fuelType)
          : null,
        transmission: f.transmission
          ? ((TRANSMISSION_TYPE_EXT_LABEL as Record<string, string>)[f.transmission] ??
            f.transmission)
          : null,
        engineDisplacementCc: f.engineDisplacementCc,
        horsepowerHp: f.horsepowerHp,
        lengthMm: f.lengthMm,
        widthMm: f.widthMm,
        heightMm: f.heightMm,
        curbWeightKg: f.curbWeightKg,
        fuelConsumptionCombined: f.fuelConsumptionCombined
          ? Number(f.fuelConsumptionCombined)
          : null,
        electricRangeKm: f.electricRangeKm,
        batteryCapacityKwh: f.batteryCapacityKwh ? Number(f.batteryCapacityKwh) : null,
        featureKeys: f.featureKeys
          .map((k) => VEHICLE_FEATURE_LABEL[k as VehicleFeatureKey] ?? k)
          .join('; '),
        listPrice: moneyCell(f.listPrice),
        hourlyPrice: moneyCell(f.hourlyPrice),
        weekdayPrice: moneyCell(f.weekdayPrice),
        weekendPrice: moneyCell(f.weekendPrice),
        monthlyPrice: moneyCell(f.monthlyPrice),
        withDriverDailyPrice: moneyCell(f.withDriverDailyPrice),
        status: STATUS_FILE_LABEL[vehicleDataStatus(row)] ?? '',
      };
      sheet.addRow(FILE_HEADERS.map((h) => values[h.field] ?? ''));
    }
    addValidations(sheet);
    writeGuide(workbook);
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      file: Buffer.from(await workbook.xlsx.writeBuffer()),
      fileName: `xeprime-du-lieu-xe-${stamp}.xlsx`,
    };
  }

  // ── nội bộ ───────────────────────────────────────────────────────────────

  /** Ảnh chụp dữ liệu hiện có — tuần tự (trong transaction tương tác là MỘT kết nối). */
  private async snapshot(db: PrismaService | Tx): Promise<VehicleDataSnapshot> {
    const items = await db.catalogItem.findMany({
      where: {
        type: {
          in: [
            CATALOG_TYPE.VEHICLE_BRAND,
            CATALOG_TYPE.BODY_TYPE,
            CATALOG_TYPE.FUEL_TYPE,
            CATALOG_TYPE.VEHICLE_FEATURE,
          ],
        },
      },
      select: { type: true, key: true, label: true, vehicleTypes: true, active: true },
    });
    const models = await db.vehicleCatalogModel.findMany({
      where: { deletedAt: null },
      select: { id: true, brandKey: true, vehicleType: true, label: true },
    });
    const records = await db.vehicleCatalogVariant.findMany({
      where: { deletedAt: null, model: { deletedAt: null } },
      select: RECORD_SELECT,
    });
    return {
      brands: items.filter((i) => i.type === CATALOG_TYPE.VEHICLE_BRAND),
      models,
      records: records.map((r) => ({
        id: r.id,
        modelId: r.modelId,
        key: r.key,
        label: r.label,
        yearFrom: r.yearFrom,
        yearTo: r.yearTo,
        active: r.active,
        reviewStatus: r.reviewStatus,
        fields: recordFields(r),
      })),
      catalogValues: new Map(
        items
          .filter((i) => i.type !== CATALOG_TYPE.VEHICLE_BRAND && i.active)
          .map((i) => [`${i.type}:${i.key}`, i.vehicleTypes]),
      ),
    };
  }

  /** Thực thi kế hoạch qua đúng các writer; trả kết quả từng dòng kèm id xe chuẩn vừa tạo. */
  private async execute(
    tx: Tx,
    actorUserId: string,
    plan: ImportPlan,
    snapshot: VehicleDataSnapshot,
  ): Promise<ImportRowResult[]> {
    const results = plan.results.map((r) => ({ ...r }));
    const modelIds = new Map<string, string>();
    const currentActive = new Map(snapshot.records.map((r) => [r.id, r.active]));
    for (const op of plan.ops) {
      if (op.type === 'brand') {
        await this.catalog.ensureBrandWithinTx(tx, actorUserId, op);
      } else if (op.type === 'model') {
        const id = await this.vehicleData.findOrCreateApprovedModel(tx, actorUserId, {
          brandKey: op.brandKey,
          vehicleType: op.vehicleType,
          label: op.label,
          origin: CATALOG_ORIGIN.IMPORT,
        });
        modelIds.set(op.ref, id);
      } else {
        const modelId = modelIds.get(op.modelRef) ?? op.modelRef;
        const model = await this.vehicleData.lockModel(tx, modelId);
        const recordId = await this.vehicleData.saveWithinTx(tx, {
          actorUserId,
          existingId: op.existingId,
          model,
          label: op.label,
          yearFrom: op.yearFrom,
          yearTo: op.yearTo,
          fields: op.fields,
          active: op.active ?? (op.existingId ? (currentActive.get(op.existingId) ?? true) : true),
          origin: op.existingId ? null : VEHICLE_DATA_ORIGIN.IMPORT,
          // `.row`: mã `vehicle_data.import` trơn trùng tên NHÁNH `import.apply` / `import.discard`
          // của cây nhãn audit (Domain.auditAction) — một mã không thể vừa là lá vừa là nhánh.
          auditAction: 'vehicle_data.import.row',
        });
        const result = results[op.rowIndex];
        if (result && result.action !== VEHICLE_DATA_ROW_ACTION.ERROR) result.recordId = recordId;
      }
    }
    return results;
  }

  private async userNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private fileInvalid(message: string): BadRequestException {
    return new BadRequestException({ code: API_ERROR_CODE.CATALOG_IMPORT_FILE_INVALID, message });
  }

  private notPending(): ConflictException {
    return new ConflictException({
      code: API_ERROR_CODE.CATALOG_IMPORT_NOT_PENDING,
      message: 'Lượt nhập này đã áp dụng, đã huỷ hoặc đã hết hạn - tải file lên lại',
    });
  }
}

const IMPORT_SELECT = {
  id: true,
  status: true,
  fileName: true,
  rowCount: true,
  summaryJson: true,
  createdBy: true,
  createdAt: true,
  appliedAt: true,
  appliedBy: true,
} as const satisfies Prisma.VehicleCatalogImportSelect;

function toImportDto(
  row: Prisma.VehicleCatalogImportGetPayload<{ select: typeof IMPORT_SELECT }>,
  names: Map<string, string>,
): VehicleDataImportDto {
  return {
    id: row.id,
    status: row.status,
    fileName: row.fileName,
    rowCount: row.rowCount,
    summary: row.summaryJson as unknown as VehicleDataImportSummaryDto,
    createdByName: names.get(row.createdBy) ?? null,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    appliedByName: row.appliedBy ? (names.get(row.appliedBy) ?? null) : null,
    expiresAt: expiresAt(row.createdAt).toISOString(),
  };
}

function expiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + LIMITS.previewTtlHours * 60 * 60 * 1000);
}

/** Tên file lưu lại để hiện ở lịch sử: bỏ đường dẫn + ký tự điều khiển, cắt độ dài. */
function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? 'file').trim();
  const clean = Array.from(base)
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('');
  return (clean || 'file').slice(0, LIMITS.fileNameMax);
}

function moneyCell(value: string | null): number | null {
  return value == null ? null : Number(value);
}

// ── Định dạng workbook ─────────────────────────────────────────────────────────────────────────

const DATA_SHEET = 'Dữ liệu xe';
const GUIDE_SHEET = 'Hướng dẫn';

const PRICE_FIELDS = new Set([
  'listPrice',
  'hourlyPrice',
  'weekdayPrice',
  'weekendPrice',
  'monthlyPrice',
  'withDriverDailyPrice',
]);

function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function writeHeader(sheet: Worksheet) {
  const header = sheet.addRow(FILE_HEADERS.map((h) => h.header));
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
  sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
  FILE_HEADERS.forEach((h, i) => {
    const col = sheet.getColumn(i + 1);
    col.width =
      h.field === 'id' ? 28 : h.field === 'featureKeys' ? 48 : h.field === 'variant' ? 22 : 16;
    if (PRICE_FIELDS.has(h.field)) col.numFmt = '#,##0';
  });
}

/** Ô thả xuống cho các cột mã — người nhập chọn thay vì gõ (ít sai chính tả). */
function addValidations(sheet: Worksheet) {
  const list = (values: readonly string[]) => [`"${values.join(',')}"`];
  const lists: Partial<Record<string, string[]>> = {
    vehicleType: list(Object.values(VEHICLE_TYPE_FILE_LABEL)),
    bodyType: list(BODY_TYPE_VALUES.map((v) => BODY_TYPE_LABEL[v])),
    fuelType: list(FUEL_TYPE_VALUES.map((v) => FUEL_TYPE_LABEL[v])),
    transmission: list(TRANSMISSION_TYPE_EXT_VALUES.map((v) => TRANSMISSION_TYPE_EXT_LABEL[v])),
    status: list([
      STATUS_FILE_LABEL[VEHICLE_DATA_STATUS.ACTIVE]!,
      STATUS_FILE_LABEL[VEHICLE_DATA_STATUS.HIDDEN]!,
    ]),
  };
  FILE_HEADERS.forEach((h, i) => {
    const formulae = lists[h.field];
    if (!formulae || formulae[0]!.length > 255) return;
    const letter = columnLetter(i);
    // exceljs: dataValidations.add theo dải ô (không có trong typings cũ — ép kiểu tối thiểu).
    (
      sheet as unknown as {
        dataValidations: { add: (range: string, rule: Record<string, unknown>) => void };
      }
    ).dataValidations.add(`${letter}2:${letter}${TEMPLATE_VALIDATION_ROWS + 1}`, {
      type: 'list',
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorTitle: 'Giá trị không hợp lệ',
      error: 'Chọn một giá trị trong danh sách',
    });
  });
}

function writeGuide(workbook: Workbook) {
  const sheet = workbook.addWorksheet(GUIDE_SHEET);
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 100;
  const title = sheet.addRow(['Dữ liệu xe - cách điền']);
  title.font = { bold: true, size: 13 };
  const rules: Array<[string, string]> = [
    [
      'Một dòng',
      'Một xe: hãng + dòng xe + phiên bản + đời (năm từ - năm đến). Phiên bản để trống khi xe chỉ có một bản.',
    ],
    [
      'Mã',
      'Có ở file xuất ra. Giữ nguyên để cập nhật đúng xe đó (đổi tên/đời được). Dòng mới để trống.',
    ],
    ['Ô trống', 'Giữ nguyên giá trị đang có. Nhập file không bao giờ xoá dữ liệu.'],
    ['Hãng / Dòng xe', 'Chưa có thì hệ thống tạo mới (báo trước ở bước xem trước).'],
    ['Năm đến', 'Để trống nếu xe còn bán.'],
    [
      'Giá',
      'Số nguyên VNĐ, ví dụ 650000 hoặc 650.000. Giá bán mới dùng để gợi ý giá trị xe cho bảo hiểm.',
    ],
    [
      'Tiện ích',
      'Nhiều tiện ích cách nhau bằng dấu chấm phẩy (;), ví dụ: Bluetooth; Camera lùi; Cảm biến lùi.',
    ],
    [
      'Trạng thái',
      'Đang gợi ý / Ẩn. Xe chờ duyệt (từ chủ xe) duyệt ở màn quản trị, cột này bị bỏ qua.',
    ],
    [
      'Xem trước',
      'Tải file lên chỉ xem trước: thêm mới / cập nhật (cũ → mới) / lỗi. Bấm Áp dụng mới ghi.',
    ],
  ];
  for (const [k, v] of rules) {
    const row = sheet.addRow([k, v]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true };
  }
  sheet.addRow([]);
  const groups: Array<[string, string[]]> = [
    ['Loại xe', Object.values(VEHICLE_TYPE_FILE_LABEL)],
    ['Kiểu dáng (ô tô)', BODY_TYPE_VALUES.map((v) => BODY_TYPE_LABEL[v])],
    ['Nhiên liệu', FUEL_TYPE_VALUES.map((v) => FUEL_TYPE_LABEL[v])],
    ['Hộp số', TRANSMISSION_TYPE_EXT_VALUES.map((v) => TRANSMISSION_TYPE_EXT_LABEL[v])],
    ['Tiện ích', Object.values(VEHICLE_FEATURE_LABEL)],
  ];
  const head = sheet.addRow(['Giá trị nhận', '']);
  head.font = { bold: true };
  for (const [k, values] of groups) {
    const row = sheet.addRow([k, values.join('; ')]);
    row.getCell(2).alignment = { wrapText: true };
  }
}

const TEMPLATE_EXAMPLES: Array<Partial<Record<string, string | number>>> = [
  {
    vehicleType: VEHICLE_TYPE_FILE_LABEL[VEHICLE_TYPE.CAR]!,
    brand: 'VinFast',
    model: 'VF 5',
    variant: 'Plus',
    yearFrom: 2023,
    seatCount: 5,
    bodyType: BODY_TYPE_LABEL.cuv,
    fuelType: FUEL_TYPE_LABEL.electric,
    transmission: TRANSMISSION_TYPE_EXT_LABEL.direct_drive,
    horsepowerHp: 134,
    lengthMm: 3967,
    widthMm: 1723,
    heightMm: 1578,
    electricRangeKm: 326,
    batteryCapacityKwh: 37.23,
    featureKeys: 'Bluetooth; Cổng USB; Túi khí an toàn; Màn hình giải trí; Camera lùi',
    listPrice: 471000000,
    hourlyPrice: 110000,
    weekdayPrice: 650000,
    weekendPrice: 720000,
    monthlyPrice: 13650000,
    withDriverDailyPrice: 1150000,
    status: STATUS_FILE_LABEL[VEHICLE_DATA_STATUS.ACTIVE]!,
  },
  {
    vehicleType: VEHICLE_TYPE_FILE_LABEL[VEHICLE_TYPE.MOTORBIKE]!,
    brand: 'Honda',
    model: 'Vision',
    variant: 'Tiêu chuẩn',
    yearFrom: 2021,
    fuelType: FUEL_TYPE_LABEL.gasoline,
    transmission: TRANSMISSION_TYPE_EXT_LABEL.automatic_cvt,
    engineDisplacementCc: 110,
    curbWeightKg: 96,
    fuelConsumptionCombined: 1.88,
    listPrice: 31500000,
    weekdayPrice: 150000,
    status: STATUS_FILE_LABEL[VEHICLE_DATA_STATUS.ACTIVE]!,
  },
];
