import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  CATALOG_ORIGIN,
  CATALOG_REVIEW_STATUS,
  VEHICLE_DATA_ORIGIN,
  VEHICLE_TYPE,
  catalogVariantKey,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesFor,
  vehicleTransmissionTypesForFuels,
  type VehicleDataOrigin,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CatalogModelService } from '../catalog/catalog-model.service';
import { CatalogService } from '../catalog/catalog.service';
import { ListingsService } from '../public-listings/listings.service';
import type {
  ApproveVehicleDataDto,
  MergeVehicleDataDto,
  RejectVehicleDataDto,
  SaveVehicleDataDto,
  UpdateVehicleDataDto,
  VehicleDataOptionDto,
  VehicleDataOptionQueryDto,
  VehicleDataReviewResultDto,
} from './dto/vehicle-data.dto';

type Tx = Prisma.TransactionClient;

/** Thông số + tiện ích + giá của một xe chuẩn — đúng tên cột ở cả bảng xe chuẩn lẫn `vehicles`. */
export interface VehicleDataFields {
  seatCount: number | null;
  bodyType: string | null;
  fuelType: string | null;
  transmission: string | null;
  engineDisplacementCc: number | null;
  horsepowerHp: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  curbWeightKg: number | null;
  fuelConsumptionCombined: string | null;
  electricRangeKm: number | null;
  batteryCapacityKwh: string | null;
  featureKeys: string[];
  listPrice: string | null;
  hourlyPrice: string | null;
  weekdayPrice: string | null;
  weekendPrice: string | null;
  monthlyPrice: string | null;
  withDriverDailyPrice: string | null;
}

export const VEHICLE_DATA_FIELD_KEYS = [
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
] as const satisfies readonly (keyof VehicleDataFields)[];

/** Trần số xe chuẩn của một hãng trong ô "Mẫu xe" gộp — một hãng lớn hôm nay vài chục phiên bản. */
const BRAND_OPTIONS_MAX = 500;

const DECIMAL_FIELDS = ['fuelConsumptionCombined', 'batteryCapacityKwh'] as const;
const MONEY_FIELDS = [
  'listPrice',
  'hourlyPrice',
  'weekdayPrice',
  'weekendPrice',
  'monthlyPrice',
  'withDriverDailyPrice',
] as const;

export const EMPTY_FIELDS: VehicleDataFields = {
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

/** Cột đọc của một xe chuẩn — đủ để dựng `VehicleDataFields` + nhận dạng + trạng thái. */
export const RECORD_SELECT = {
  id: true,
  modelId: true,
  key: true,
  label: true,
  yearFrom: true,
  yearTo: true,
  seatCount: true,
  bodyType: true,
  fuelType: true,
  transmission: true,
  engineDisplacementCc: true,
  horsepowerHp: true,
  lengthMm: true,
  widthMm: true,
  heightMm: true,
  curbWeightKg: true,
  fuelConsumptionCombined: true,
  electricRangeKm: true,
  batteryCapacityKwh: true,
  featureKeys: true,
  listPrice: true,
  hourlyPrice: true,
  weekdayPrice: true,
  weekendPrice: true,
  monthlyPrice: true,
  withDriverDailyPrice: true,
  active: true,
  reviewStatus: true,
  origin: true,
  sourceVehicleId: true,
} as const satisfies Prisma.VehicleCatalogVariantSelect;

export type RecordRow = Prisma.VehicleCatalogVariantGetPayload<{ select: typeof RECORD_SELECT }>;

/** Dòng xe tối thiểu mà một lượt ghi xe chuẩn cần. */
export interface ParentModel {
  id: string;
  label: string;
  brandKey: string;
  vehicleType: string;
  reviewStatus: string;
  seatCounts: number[];
  fuelTypes: string[];
  transmissions: string[];
}

const PARENT_SELECT = {
  id: true,
  label: true,
  brandKey: true,
  vehicleType: true,
  reviewStatus: true,
  seatCounts: true,
  fuelTypes: true,
  transmissions: true,
  deletedAt: true,
} as const;

/** Xe chủ xe — cột dùng để tự ghi nhận một xe chuẩn từ nó. */
const SOURCE_VEHICLE_SELECT = {
  id: true,
  vehicleType: true,
  vehicleCatalogModelId: true,
  vehicleCatalogVariantId: true,
  manufactureYear: true,
  seatCount: true,
  bodyType: true,
  fuelType: true,
  transmission: true,
  engineDisplacementCc: true,
  horsepowerHp: true,
  lengthMm: true,
  widthMm: true,
  heightMm: true,
  curbWeightKg: true,
  fuelConsumptionCombined: true,
  electricRangeKm: true,
  batteryCapacityKwh: true,
  hourlyPrice: true,
  weekdayPrice: true,
  weekendPrice: true,
  monthlyPrice: true,
  withDriverDailyPrice: true,
  features: { select: { featureKey: true } },
} as const satisfies Prisma.VehicleSelect;

function decimalString(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toString();
}

function moneyString(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toFixed(0);
}

/** Bản ghi DB ⇒ bộ trường so sánh được (chuỗi số, mảng tiện ích đã sắp). */
export function recordFields(
  row: Pick<RecordRow, (typeof VEHICLE_DATA_FIELD_KEYS)[number]>,
): VehicleDataFields {
  return {
    seatCount: row.seatCount,
    bodyType: row.bodyType,
    fuelType: row.fuelType,
    transmission: row.transmission,
    engineDisplacementCc: row.engineDisplacementCc,
    horsepowerHp: row.horsepowerHp,
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    curbWeightKg: row.curbWeightKg,
    fuelConsumptionCombined: decimalString(row.fuelConsumptionCombined),
    electricRangeKm: row.electricRangeKm,
    batteryCapacityKwh: decimalString(row.batteryCapacityKwh),
    featureKeys: [...row.featureKeys],
    listPrice: moneyString(row.listPrice),
    hourlyPrice: moneyString(row.hourlyPrice),
    weekdayPrice: moneyString(row.weekdayPrice),
    weekendPrice: moneyString(row.weekendPrice),
    monthlyPrice: moneyString(row.monthlyPrice),
    withDriverDailyPrice: moneyString(row.withDriverDailyPrice),
  };
}

/** Chuẩn hoá để so sánh: số thập phân bỏ 0 thừa ("5.70" = "5.7"), tiện ích bỏ trùng + sắp. */
export function normalizeFields(fields: VehicleDataFields): VehicleDataFields {
  const out = { ...fields, featureKeys: [...new Set(fields.featureKeys)].sort() };
  for (const key of DECIMAL_FIELDS) {
    const v = out[key];
    out[key] = v == null ? null : String(Number(v));
  }
  for (const key of MONEY_FIELDS) {
    const v = out[key];
    out[key] = v == null ? null : v.replace(/^0+(?=\d)/, '');
  }
  return out;
}

export function toOptionDto(row: RecordRow): VehicleDataOptionDto {
  const f = recordFields(row);
  return {
    id: row.id,
    modelId: row.modelId,
    label: row.label,
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    seatCount: f.seatCount,
    bodyType: f.bodyType,
    fuelType: f.fuelType,
    transmission: f.transmission,
    engineDisplacementCc: f.engineDisplacementCc,
    horsepowerHp: f.horsepowerHp,
    lengthMm: f.lengthMm,
    widthMm: f.widthMm,
    heightMm: f.heightMm,
    curbWeightKg: f.curbWeightKg,
    fuelConsumptionCombined: f.fuelConsumptionCombined,
    electricRangeKm: f.electricRangeKm,
    batteryCapacityKwh: f.batteryCapacityKwh,
    featureKeys: f.featureKeys,
    reviewStatus: row.reviewStatus,
  };
}

/** Đời xe chứa năm `year` (đầu mút trống = mở). */
export function coversYear(year: number) {
  return {
    AND: [
      { OR: [{ yearFrom: null }, { yearFrom: { lte: year } }] },
      { OR: [{ yearTo: null }, { yearTo: { gte: year } }] },
    ],
  } satisfies Prisma.VehicleCatalogVariantWhereInput;
}

/**
 * Luật hình dạng của một xe chuẩn — trả MÔ TẢ lỗi đầu tiên hoặc null. Thuần, để lượt nhập file báo
 * lỗi theo dòng mà không ném.
 */
export function vehicleDataSpecIssue(
  vehicleType: string,
  input: Pick<VehicleDataFields, 'seatCount' | 'bodyType' | 'fuelType' | 'transmission'> & {
    yearFrom: number | null;
    yearTo: number | null;
  },
): string | null {
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;
  if (isMotorbike && input.seatCount != null) return 'Số chỗ chỉ áp dụng cho ô tô';
  if (isMotorbike && input.bodyType) return 'Kiểu dáng chỉ áp dụng cho ô tô';
  if (
    input.fuelType &&
    !(vehicleFuelTypesFor(vehicleType) as readonly string[]).includes(input.fuelType)
  ) {
    return `Nguồn năng lượng "${input.fuelType}" không dùng cho loại xe này`;
  }
  if (input.transmission) {
    const allowed = (
      input.fuelType
        ? vehicleTransmissionTypesFor(vehicleType, input.fuelType)
        : vehicleTransmissionTypesForFuels(vehicleType, vehicleFuelTypesFor(vehicleType))
    ) as readonly string[];
    if (!allowed.includes(input.transmission)) {
      return `Hộp số "${input.transmission}" không khớp nguồn năng lượng`;
    }
  }
  if (input.yearFrom != null && input.yearTo != null && input.yearTo < input.yearFrom) {
    return 'Năm kết thúc phải sau năm bắt đầu';
  }
  return null;
}

/**
 * Dữ liệu xe chuẩn (ADR 0090) — đường ghi DUY NHẤT của `vehicle_catalog_variants`.
 *
 * Ba nguồn ghi đều đi qua `saveWithinTx`: admin sửa ở màn "Dữ liệu xe", lượt nhập file, và lượt tự
 * ghi nhận từ xe của chủ xe (`captureFromVehicleWithinTx`, gọi trong transaction lưu xe). Duyệt /
 * gộp / từ chối đổi liên kết của xe đang gắn trong CÙNG transaction và đồng bộ lại ảnh chụp chợ
 * (ADR 0008).
 */
@Injectable()
export class VehicleDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly catalog: CatalogService,
    private readonly models: CatalogModelService,
    private readonly listings: ListingsService,
  ) {}

  // ── Ô "Phiên bản" của form chủ xe ────────────────────────────────────────

  /**
   * Xe chuẩn ĐÃ DUYỆT, đang gợi ý của một dòng, ưu tiên đúng đời với năm sản xuất. Không có xe chuẩn
   * nào hợp đời (dữ liệu mới có đời hiện hành, xe của chủ xe đời trước) ⇒ vẫn trả MỌI xe chuẩn của
   * dòng — nhãn có đời nên chủ xe tự thấy chênh, còn hơn ô chọn rỗng. `includeId` (xe chuẩn đang gắn
   * với xe đang mở) luôn có mặt, kể cả chờ duyệt/đã ẩn/ngoài đời.
   */
  async listOptions(query: VehicleDataOptionQueryDto): Promise<VehicleDataOptionDto[]> {
    if (!query.modelId) return this.listBrandOptions(query);
    const base = {
      modelId: query.modelId,
      deletedAt: null,
      active: true,
      reviewStatus: CATALOG_REVIEW_STATUS.APPROVED,
    } satisfies Prisma.VehicleCatalogVariantWhereInput;
    const find = (where: Prisma.VehicleCatalogVariantWhereInput) =>
      this.prisma.vehicleCatalogVariant.findMany({
        where,
        orderBy: [{ label: 'asc' }, { yearFrom: 'desc' }],
        take: 200,
        select: RECORD_SELECT,
      });
    let rows = await find(query.year ? { ...base, ...coversYear(query.year) } : base);
    if (rows.length === 0 && query.year) rows = await find(base);
    if (query.includeId && !rows.some((r) => r.id === query.includeId)) {
      const attached = await this.prisma.vehicleCatalogVariant.findFirst({
        where: { id: query.includeId, modelId: query.modelId, deletedAt: null },
        select: RECORD_SELECT,
      });
      if (attached) rows.unshift(attached);
    }
    return rows.map(toOptionDto);
  }

  /**
   * Ô "Mẫu xe" gộp của form đăng xe (ADR 0102): MỌI xe chuẩn đã duyệt, đang gợi ý của các dòng xe
   * đang bật, đã duyệt của một hãng + loại xe — theo thứ tự dòng (như ô Dòng xe) rồi phiên bản, đời
   * mới trước. Không lọc theo năm: ô chọn hiện đời của từng phiên bản, năm khai SAU khi chọn xe.
   * `includeId` (xe chuẩn đang gắn) luôn có mặt nếu thuộc đúng hãng, kể cả chờ duyệt/đã ẩn.
   */
  private async listBrandOptions(
    query: VehicleDataOptionQueryDto,
  ): Promise<VehicleDataOptionDto[]> {
    if (!query.brandKey || !query.vehicleType) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Cần modelId, hoặc brandKey kèm vehicleType',
      });
    }
    const brandScope = {
      brandKey: query.brandKey,
      vehicleType: query.vehicleType,
      deletedAt: null,
    };
    const rows = await this.prisma.vehicleCatalogVariant.findMany({
      where: {
        deletedAt: null,
        active: true,
        reviewStatus: CATALOG_REVIEW_STATUS.APPROVED,
        model: { ...brandScope, active: true, reviewStatus: CATALOG_REVIEW_STATUS.APPROVED },
      },
      orderBy: [
        { model: { sortOrder: 'asc' } },
        { model: { label: 'asc' } },
        { label: 'asc' },
        { yearFrom: 'desc' },
      ],
      take: BRAND_OPTIONS_MAX,
      select: RECORD_SELECT,
    });
    if (query.includeId && !rows.some((r) => r.id === query.includeId)) {
      const attached = await this.prisma.vehicleCatalogVariant.findFirst({
        where: { id: query.includeId, deletedAt: null, model: brandScope },
        select: RECORD_SELECT,
      });
      if (attached) rows.unshift(attached);
    }
    return rows.map(toOptionDto);
  }

  /**
   * Xe chuẩn gửi lên khi lưu xe phải thuộc ĐÚNG dòng của xe, còn sống và không bị từ chối. Dòng chờ
   * duyệt được nhận — có thể chính xe này đã tạo ra nó.
   */
  async resolveForVehicle(
    recordId: string | null | undefined,
    modelId: string | null,
  ): Promise<string | null> {
    if (!recordId) return null;
    const row = await this.prisma.vehicleCatalogVariant.findFirst({
      where: { id: recordId, deletedAt: null },
      select: { modelId: true },
    });
    if (!row || !modelId || row.modelId !== modelId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.CATALOG_VARIANT_MISMATCH,
        message: 'Phiên bản không thuộc dòng xe đã chọn',
      });
    }
    return recordId;
  }

  // ── Màn quản trị ─────────────────────────────────────────────────────────

  async create(actorUserId: string, dto: SaveVehicleDataDto): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const model = await this.resolveModelForWrite(tx, actorUserId, dto, null);
      return this.saveWithinTx(tx, {
        actorUserId,
        existingId: null,
        model,
        label: dto.variantLabel ?? '',
        yearFrom: dto.yearFrom ?? null,
        yearTo: dto.yearTo ?? null,
        fields: mergeFields(EMPTY_FIELDS, dto),
        active: dto.active ?? true,
        origin: VEHICLE_DATA_ORIGIN.ADMIN,
      });
    });
  }

  /** Sửa (kể cả xe chuẩn đang chờ — admin chỉnh trước khi duyệt). Đổi dòng xe = dời xe đang gắn. */
  async update(actorUserId: string, id: string, dto: UpdateVehicleDataDto): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockRecord(tx, id);
      const model =
        dto.modelId || dto.newModelLabel
          ? await this.resolveModelForWrite(tx, actorUserId, dto, current.vehicleType)
          : await this.lockModel(tx, current.modelId);
      await this.saveWithinTx(tx, {
        actorUserId,
        existingId: id,
        model,
        label: dto.variantLabel !== undefined ? dto.variantLabel : current.label,
        yearFrom: dto.yearFrom !== undefined ? dto.yearFrom : current.yearFrom,
        yearTo: dto.yearTo !== undefined ? dto.yearTo : current.yearTo,
        fields: mergeFields(recordFields(current), dto),
        active: dto.active ?? current.active,
        origin: null,
      });
    });
  }

  /** Xoá MỀM khi chưa xe nào gắn; có xe thì phải Ẩn (giữ liên kết của xe cũ). */
  async remove(actorUserId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockRecord(tx, id);
      const used = await tx.vehicle.count({
        where: { vehicleCatalogVariantId: id, deletedAt: null },
      });
      if (used > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CATALOG_VARIANT_IN_USE,
          message: `Đang có ${used} xe dùng dữ liệu này - hãy ẩn thay vì xoá`,
        });
      }
      await tx.vehicleCatalogVariant.update({
        where: { id },
        data: { deletedAt: new Date(), active: false, updatedBy: actorUserId },
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'vehicle_data.delete',
          targetType: 'vehicle_catalog_variant',
          targetId: id,
          before: { modelId: current.modelId, label: current.label, yearFrom: current.yearFrom },
        },
        tx,
      );
      await this.cleanupPendingModelWithinTx(tx, actorUserId, current.modelId, 'deleted');
    });
  }

  /** Duyệt một xe chuẩn chờ duyệt (đã sửa trước nếu cần). Dòng xe mới đi kèm được duyệt theo. */
  async approve(
    actorUserId: string,
    id: string,
    dto: ApproveVehicleDataDto,
  ): Promise<VehicleDataReviewResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockPending(tx, id);
      await this.models.approvePendingWithinTx(tx, actorUserId, current.modelId, null);
      const now = new Date();
      await tx.vehicleCatalogVariant.update({
        where: { id },
        data: {
          reviewStatus: CATALOG_REVIEW_STATUS.APPROVED,
          active: true,
          reviewedAt: now,
          reviewedBy: actorUserId,
          reviewNote: dto.note ?? null,
          updatedBy: actorUserId,
        },
      });
      const vehicles = await tx.vehicle.count({ where: { vehicleCatalogVariantId: id } });
      await this.recordReview(tx, actorUserId, 'vehicle_data.approve', id, {
        note: dto.note ?? null,
      });
      return { id, reviewStatus: CATALOG_REVIEW_STATUS.APPROVED, vehiclesAffected: vehicles };
    });
  }

  /**
   * Gộp một xe chuẩn chờ duyệt vào một xe chuẩn ĐÃ DUYỆT: xe đang gắn trỏ sang xe đích (dòng xe +
   * tên hãng/dòng chép lại theo đích), dòng chờ bị đóng. Dòng xe mới không còn ai dùng thì gỡ luôn.
   */
  async merge(
    actorUserId: string,
    id: string,
    dto: MergeVehicleDataDto,
  ): Promise<VehicleDataReviewResultDto> {
    if (dto.targetId === id) throw this.reviewInvalid('Không gộp một xe chuẩn vào chính nó');
    const touched = await this.prisma.$transaction(async (tx) => {
      const source = await this.lockPending(tx, id);
      const target = await tx.vehicleCatalogVariant.findFirst({
        where: { id: dto.targetId, deletedAt: null, reviewStatus: CATALOG_REVIEW_STATUS.APPROVED },
        select: {
          id: true,
          modelId: true,
          model: { select: { brandKey: true, label: true, vehicleType: true } },
        },
      });
      if (!target) throw this.reviewInvalid('Xe chuẩn đích không có hoặc chưa được duyệt');
      if (target.model.vehicleType !== source.vehicleType) {
        throw this.reviewInvalid('Xe chuẩn đích khác loại xe');
      }
      const vehicleIds = (
        await tx.vehicle.findMany({ where: { vehicleCatalogVariantId: id }, select: { id: true } })
      ).map((v) => v.id);
      await tx.vehicle.updateMany({
        where: { vehicleCatalogVariantId: id },
        data: {
          vehicleCatalogVariantId: target.id,
          vehicleCatalogModelId: target.modelId,
          brand: target.model.brandKey,
          model: target.model.label,
        },
      });
      await this.closeRecord(tx, actorUserId, id, dto.note ?? `merged:${target.id}`);
      const unlinked = await this.cleanupPendingModelWithinTx(
        tx,
        actorUserId,
        source.modelId,
        `merged:${target.id}`,
      );
      const all = [...new Set([...vehicleIds, ...unlinked])];
      await this.resyncListings(tx, all);
      await this.recordReview(tx, actorUserId, 'vehicle_data.merge', id, {
        targetId: target.id,
        note: dto.note ?? null,
        vehicles: all.length,
      });
      return all;
    });
    return { id, reviewStatus: CATALOG_REVIEW_STATUS.REJECTED, vehiclesAffected: touched.length };
  }

  /**
   * Từ chối: dòng chờ bị đóng, xe đang gắn BỎ liên kết nhưng giữ nguyên tên hãng/dòng chủ xe đã
   * thấy. Dòng xe mới (chủ xe gõ) không còn xe chuẩn nào khác thì bị từ chối theo.
   */
  async reject(
    actorUserId: string,
    id: string,
    dto: RejectVehicleDataDto,
  ): Promise<VehicleDataReviewResultDto> {
    const touched = await this.prisma.$transaction(async (tx) => {
      const source = await this.lockPending(tx, id);
      const vehicleIds = (
        await tx.vehicle.findMany({ where: { vehicleCatalogVariantId: id }, select: { id: true } })
      ).map((v) => v.id);
      await tx.vehicle.updateMany({
        where: { vehicleCatalogVariantId: id },
        data: { vehicleCatalogVariantId: null },
      });
      await this.closeRecord(tx, actorUserId, id, dto.reason);
      const unlinked = await this.cleanupPendingModelWithinTx(
        tx,
        actorUserId,
        source.modelId,
        dto.reason,
      );
      const all = [...new Set([...vehicleIds, ...unlinked])];
      await this.resyncListings(tx, all);
      await this.recordReview(tx, actorUserId, 'vehicle_data.reject', id, {
        reason: dto.reason,
        vehicles: all.length,
      });
      return all;
    });
    return { id, reviewStatus: CATALOG_REVIEW_STATUS.REJECTED, vehiclesAffected: touched.length };
  }

  // ── Ghi chung (màn quản trị · nhập file · tự ghi nhận) ───────────────────

  /**
   * Ghi MỘT xe chuẩn (tạo / sửa) trong transaction của nơi gọi. Kiểm thông số theo luật loại xe +
   * danh mục, chặn trùng nhận dạng (dòng · phiên bản · năm bắt đầu), dời xe đang gắn khi đổi dòng
   * xe, nới mảng thông số của dòng cho khớp và ghi audit. Trả id.
   */
  async saveWithinTx(
    tx: Tx,
    input: {
      actorUserId: string;
      existingId: string | null;
      model: ParentModel;
      label: string;
      yearFrom: number | null;
      yearTo: number | null;
      fields: VehicleDataFields;
      active: boolean;
      /** Nguồn gốc khi TẠO; null khi sửa. */
      origin: VehicleDataOrigin | null;
      /** Tự ghi nhận từ xe của chủ xe: dòng mới ở trạng thái chờ duyệt. */
      pendingFrom?: { tenantId: string; userId: string; vehicleId: string };
      auditAction?: string;
    },
  ): Promise<string> {
    const { model } = input;
    const label = input.label.trim();
    const key = catalogVariantKey(label);
    if (label && !key) throw this.invalidSpec('Tên phiên bản không hợp lệ');
    const fields = normalizeFields(input.fields);
    const issue = vehicleDataSpecIssue(model.vehicleType, {
      ...fields,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
    });
    if (issue) throw this.invalidSpec(issue);
    // Kiểu dáng / nhiên liệu / tiện ích phải có trong danh mục VÀ dùng được cho loại xe — đúng phép
    // kiểm khi lưu một chiếc xe, để "Áp dụng" không bao giờ đưa vào form một giá trị nó từ chối.
    await this.catalog.assertVehicleValues({
      bodyType: fields.bodyType,
      fuelType: fields.fuelType,
      features: fields.featureKeys,
      vehicleType: model.vehicleType,
    });

    const clash = await tx.vehicleCatalogVariant.findFirst({
      where: {
        modelId: model.id,
        key,
        yearFrom: input.yearFrom,
        deletedAt: null,
        ...(input.existingId ? { id: { not: input.existingId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: API_ERROR_CODE.CATALOG_VARIANT_DUPLICATE,
        message: 'Đã có dữ liệu cho xe này (cùng dòng xe, phiên bản và năm bắt đầu)',
        details: { id: clash.id },
      });
    }

    const data = {
      modelId: model.id,
      key,
      label,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      ...fields,
      active: input.active,
      updatedBy: input.actorUserId,
    };

    let id = input.existingId;
    let before: Record<string, unknown> | null = null;
    if (id) {
      const prev = await tx.vehicleCatalogVariant.findUniqueOrThrow({
        where: { id },
        select: RECORD_SELECT,
      });
      before = auditShape({ ...recordFields(prev), modelId: prev.modelId, label: prev.label });
      await tx.vehicleCatalogVariant.update({ where: { id }, data });
      if (prev.modelId !== model.id) {
        // Đổi dòng xe: xe đang gắn đi theo (dòng + cột chữ hãng/dòng), ảnh chụp chợ đồng bộ lại.
        const vehicleIds = (
          await tx.vehicle.findMany({
            where: { vehicleCatalogVariantId: id },
            select: { id: true },
          })
        ).map((v) => v.id);
        await tx.vehicle.updateMany({
          where: { vehicleCatalogVariantId: id },
          data: { vehicleCatalogModelId: model.id, brand: model.brandKey, model: model.label },
        });
        const unlinked = await this.cleanupPendingModelWithinTx(
          tx,
          input.actorUserId,
          prev.modelId,
          `moved:${id}`,
        );
        await this.resyncListings(tx, [...new Set([...vehicleIds, ...unlinked])]);
      }
    } else {
      id = newId();
      await tx.vehicleCatalogVariant.create({
        data: {
          id,
          ...data,
          origin: input.origin ?? VEHICLE_DATA_ORIGIN.ADMIN,
          createdBy: input.actorUserId,
          ...(input.pendingFrom
            ? {
                reviewStatus: CATALOG_REVIEW_STATUS.PENDING,
                proposedByTenantId: input.pendingFrom.tenantId,
                proposedByUserId: input.pendingFrom.userId,
                sourceVehicleId: input.pendingFrom.vehicleId,
              }
            : {}),
        },
      });
    }

    await this.widenModelWithinTx(tx, model, fields);
    await this.audit.record(
      {
        ...(input.pendingFrom ? { tenantId: input.pendingFrom.tenantId } : {}),
        actorUserId: input.actorUserId,
        actorScope: input.pendingFrom ? 'tenant' : 'platform',
        action:
          input.auditAction ?? (input.existingId ? 'vehicle_data.update' : 'vehicle_data.create'),
        targetType: 'vehicle_catalog_variant',
        targetId: id,
        before,
        after: auditShape({ ...fields, modelId: model.id, label, yearFrom: input.yearFrom }),
      },
      tx,
    );
    return id;
  }

  /**
   * TỰ GHI NHẬN dữ liệu từ xe của chủ xe (ADR 0090) — gọi ở cuối transaction tạo/sửa xe/sửa giá.
   *
   * - Chủ xe gõ một phiên bản chưa có ⇒ gắn xe vào xe chuẩn cùng tên nếu đã có (đã duyệt hay đang
   *   chờ), không thì tạo một dòng CHỜ DUYỆT lấy thông số, tiện ích, giá từ chính xe này.
   * - Không chọn phiên bản mà dòng xe còn mới (chủ xe gõ) hoặc chưa có dữ liệu nào ⇒ như trên với
   *   phiên bản rỗng.
   * - Dòng chờ duyệt do CHÍNH xe này tạo được cập nhật theo xe tới khi admin duyệt.
   *
   * Không bao giờ chặn lượt lưu xe: quá trần 24 giờ thì chỉ bỏ qua bước ghi nhận.
   */
  async captureFromVehicleWithinTx(
    tx: Tx,
    input: { tenantId: string; userId: string; vehicleId: string; variantLabel?: string | null },
  ): Promise<void> {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: SOURCE_VEHICLE_SELECT,
    });
    if (!vehicle) return;
    const previousId = vehicle.vehicleCatalogVariantId;
    let targetId = previousId;

    if (vehicle.vehicleCatalogModelId) {
      const typed = input.variantLabel?.trim();
      if (typed !== undefined && typed !== '') {
        targetId = await this.findOrCapture(tx, input, vehicle, typed);
      } else if (!targetId && typed === undefined) {
        const model = await tx.vehicleCatalogModel.findUnique({
          where: { id: vehicle.vehicleCatalogModelId },
          select: { reviewStatus: true },
        });
        const approvedCount = await tx.vehicleCatalogVariant.count({
          where: {
            modelId: vehicle.vehicleCatalogModelId,
            deletedAt: null,
            reviewStatus: CATALOG_REVIEW_STATUS.APPROVED,
          },
        });
        if (model?.reviewStatus === CATALOG_REVIEW_STATUS.PENDING || approvedCount === 0) {
          targetId = await this.findOrCapture(tx, input, vehicle, '');
        }
      }
    }

    if (targetId !== previousId) {
      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { vehicleCatalogVariantId: targetId },
      });
    }
    // Dòng chờ do chính xe này tạo: cập nhật theo dữ liệu mới nhất của xe.
    if (targetId) await this.refreshFromSourceWithinTx(tx, targetId, vehicle);
    // Dòng chờ cũ do xe này tạo mà xe đã rời đi và không còn ai dùng: dọn (không để rác chờ duyệt).
    if (previousId && previousId !== targetId) {
      await this.dropOrphanCaptureWithinTx(tx, input.userId, previousId, vehicle.id);
    }
  }

  // ── nội bộ ───────────────────────────────────────────────────────────────

  private async findOrCapture(
    tx: Tx,
    input: { tenantId: string; userId: string; vehicleId: string },
    vehicle: Prisma.VehicleGetPayload<{ select: typeof SOURCE_VEHICLE_SELECT }>,
    label: string,
  ): Promise<string | null> {
    const modelId = vehicle.vehicleCatalogModelId!;
    const key = catalogVariantKey(label);
    if (label && !key) return null;
    const candidates = await tx.vehicleCatalogVariant.findMany({
      where: { modelId, key, deletedAt: null },
      select: { id: true, reviewStatus: true, yearFrom: true, yearTo: true },
      orderBy: [{ yearFrom: 'desc' }],
    });
    const year = vehicle.manufactureYear;
    const covers = (c: { yearFrom: number | null; yearTo: number | null }) =>
      year == null ||
      ((c.yearFrom == null || c.yearFrom <= year) && (c.yearTo == null || c.yearTo >= year));
    const approved = candidates.filter((c) => c.reviewStatus === CATALOG_REVIEW_STATUS.APPROVED);
    const match =
      approved.find(covers) ??
      candidates.find((c) => c.reviewStatus === CATALOG_REVIEW_STATUS.PENDING) ??
      approved[0];
    if (match) return match.id;

    // Khoá theo gian hàng (cùng khoá với dòng xe gõ mới) rồi mới đếm trần.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vehicle-data-owner:${input.tenantId}`}))`;
    if (await this.models.ownerQuotaExceeded(tx, input.tenantId)) return null;
    const model = await this.lockModel(tx, modelId);
    try {
      return await this.saveWithinTx(tx, {
        actorUserId: input.userId,
        existingId: null,
        model,
        label,
        yearFrom: year ?? null,
        yearTo: year ?? null,
        fields: fieldsFromVehicle(vehicle),
        active: true,
        origin: VEHICLE_DATA_ORIGIN.OWNER,
        pendingFrom: input,
        auditAction: 'vehicle_data.capture',
      });
    } catch (error) {
      // Dữ liệu chủ xe khai không qua được luật của xe chuẩn (hiếm — xe đã qua cùng luật) ⇒ không
      // ghi nhận, KHÔNG làm hỏng lượt lưu xe.
      if (error instanceof BadRequestException || error instanceof ConflictException) return null;
      throw error;
    }
  }

  private async refreshFromSourceWithinTx(
    tx: Tx,
    recordId: string,
    vehicle: Prisma.VehicleGetPayload<{ select: typeof SOURCE_VEHICLE_SELECT }>,
  ) {
    const row = await tx.vehicleCatalogVariant.findUnique({
      where: { id: recordId },
      select: { ...RECORD_SELECT, deletedAt: true },
    });
    if (
      !row ||
      row.deletedAt ||
      row.reviewStatus !== CATALOG_REVIEW_STATUS.PENDING ||
      row.sourceVehicleId !== vehicle.id
    ) {
      return;
    }
    const next = normalizeFields({ ...fieldsFromVehicle(vehicle), listPrice: null });
    const year = vehicle.manufactureYear;
    const sameYear = (row.yearFrom ?? null) === (year ?? null);
    if (
      sameYear &&
      JSON.stringify(next) ===
        JSON.stringify(normalizeFields({ ...recordFields(row), listPrice: null }))
    ) {
      return;
    }
    // Không kiểm luật ở đây: dữ liệu vừa qua đúng luật của xe khi lưu; dòng chờ chỉ là bản chụp.
    const clash = sameYear
      ? null
      : await tx.vehicleCatalogVariant.findFirst({
          where: {
            modelId: row.modelId,
            key: row.key,
            yearFrom: year ?? null,
            deletedAt: null,
            id: { not: recordId },
          },
          select: { id: true },
        });
    await tx.vehicleCatalogVariant.update({
      where: { id: recordId },
      data: {
        ...next,
        listPrice: undefined,
        ...(clash ? {} : { yearFrom: year ?? null, yearTo: year ?? null }),
      },
    });
  }

  private async dropOrphanCaptureWithinTx(
    tx: Tx,
    actorUserId: string,
    recordId: string,
    vehicleId: string,
  ) {
    const row = await tx.vehicleCatalogVariant.findUnique({
      where: { id: recordId },
      select: { modelId: true, reviewStatus: true, sourceVehicleId: true, deletedAt: true },
    });
    if (
      !row ||
      row.deletedAt ||
      row.reviewStatus !== CATALOG_REVIEW_STATUS.PENDING ||
      row.sourceVehicleId !== vehicleId
    ) {
      return;
    }
    const used = await tx.vehicle.count({ where: { vehicleCatalogVariantId: recordId } });
    if (used > 0) return;
    await tx.vehicleCatalogVariant.update({
      where: { id: recordId },
      data: { deletedAt: new Date(), active: false },
    });
    await this.cleanupPendingModelWithinTx(tx, actorUserId, row.modelId, 'abandoned');
  }

  /**
   * Dòng xe chủ xe gõ mới (pending) mà không còn xe chuẩn nào sống dưới nó ⇒ gỡ (xe đang gắn bỏ
   * liên kết dòng, giữ cột chữ). Trả id các xe bị đổi.
   */
  private async cleanupPendingModelWithinTx(
    tx: Tx,
    actorUserId: string,
    modelId: string,
    reason: string,
  ): Promise<string[]> {
    const model = await tx.vehicleCatalogModel.findUnique({
      where: { id: modelId },
      select: { reviewStatus: true, deletedAt: true },
    });
    if (!model || model.deletedAt || model.reviewStatus !== CATALOG_REVIEW_STATUS.PENDING)
      return [];
    const live = await tx.vehicleCatalogVariant.count({ where: { modelId, deletedAt: null } });
    if (live > 0) return [];
    return this.models.rejectPendingWithinTx(tx, actorUserId, modelId, reason);
  }

  /**
   * Dòng xe cho một lượt ghi của admin: `modelId` (đã có) hoặc `brandKey` + `newModelLabel` (tạo dòng
   * xe đã duyệt — trùng tên một dòng sống thì dùng dòng đó; trùng dòng chủ xe gõ đang chờ thì duyệt
   * nó). Khoá dòng xe để hai lượt ghi không cùng nới mảng thông số.
   */
  private async resolveModelForWrite(
    tx: Tx,
    actorUserId: string,
    dto: SaveVehicleDataDto,
    currentVehicleType: string | null,
  ): Promise<ParentModel> {
    if (dto.modelId) {
      const model = await this.lockModel(tx, dto.modelId);
      if (currentVehicleType && model.vehicleType !== currentVehicleType) {
        throw this.invalidSpec('Dòng xe mới khác loại xe');
      }
      return model;
    }
    const vehicleType = dto.vehicleType ?? currentVehicleType;
    if (!dto.brandKey || !dto.newModelLabel || !vehicleType) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chọn dòng xe, hoặc nhập hãng + tên dòng xe mới',
      });
    }
    if (currentVehicleType && vehicleType !== currentVehicleType) {
      throw this.invalidSpec('Không đổi loại xe của dữ liệu đã có');
    }
    await this.models.assertBrandExists(dto.brandKey, vehicleType);
    const id = await this.findOrCreateApprovedModel(tx, actorUserId, {
      brandKey: dto.brandKey,
      vehicleType,
      label: dto.newModelLabel,
      origin: CATALOG_ORIGIN.ADMIN,
    });
    return this.lockModel(tx, id);
  }

  /**
   * Dòng xe theo (hãng, loại xe, tên) — dùng lại dòng sống cùng tên (duyệt nó nếu đang chờ), không
   * thì tạo dòng đã duyệt. Dùng chung cho admin và lượt nhập file.
   */
  async findOrCreateApprovedModel(
    tx: Tx,
    actorUserId: string,
    input: {
      brandKey: string;
      vehicleType: string;
      label: string;
      origin: typeof CATALOG_ORIGIN.ADMIN | typeof CATALOG_ORIGIN.IMPORT;
    },
  ): Promise<string> {
    const label = input.label.trim();
    const live = await tx.vehicleCatalogModel.findFirst({
      where: {
        brandKey: input.brandKey,
        vehicleType: input.vehicleType,
        label: { equals: label, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, reviewStatus: true },
    });
    if (live) {
      if (live.reviewStatus === CATALOG_REVIEW_STATUS.PENDING) {
        await this.models.approvePendingWithinTx(tx, actorUserId, live.id, null);
      }
      return live.id;
    }
    return this.models.createApprovedWithinTx(tx, actorUserId, { ...input, label });
  }

  /** Khoá dòng xe (FOR UPDATE) + đọc mảng thông số. */
  async lockModel(tx: Tx, modelId: string): Promise<ParentModel> {
    await tx.$queryRaw`SELECT id FROM vehicle_catalog_models WHERE id = ${modelId} FOR UPDATE`;
    const model = await tx.vehicleCatalogModel.findUnique({
      where: { id: modelId },
      select: PARENT_SELECT,
    });
    if (!model || model.deletedAt) throw new NotFoundException('Không tìm thấy dòng xe');
    return model;
  }

  private async lockRecord(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM vehicle_catalog_variants WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Không tìm thấy dữ liệu xe');
    const row = await tx.vehicleCatalogVariant.findUniqueOrThrow({
      where: { id },
      select: { ...RECORD_SELECT, model: { select: { vehicleType: true } } },
    });
    const { model, ...rest } = row;
    return { ...rest, vehicleType: model.vehicleType };
  }

  private async lockPending(tx: Tx, id: string) {
    const row = await this.lockRecord(tx, id);
    if (row.reviewStatus !== CATALOG_REVIEW_STATUS.PENDING) {
      throw this.reviewInvalid('Dữ liệu này không còn chờ duyệt');
    }
    return row;
  }

  private async closeRecord(tx: Tx, actorUserId: string, id: string, note: string) {
    const now = new Date();
    await tx.vehicleCatalogVariant.update({
      where: { id },
      data: {
        reviewStatus: CATALOG_REVIEW_STATUS.REJECTED,
        deletedAt: now,
        active: false,
        reviewedAt: now,
        reviewedBy: actorUserId,
        reviewNote: note.slice(0, 500),
        updatedBy: actorUserId,
      },
    });
  }

  /**
   * Nới mảng thông số CẤP DÒNG XE để chứa giá trị của xe chuẩn. Chỉ nới mảng đã có giá trị: mảng
   * rỗng nghĩa là "chưa xác minh ⇒ chủ xe khai tự do", thêm một giá trị vào đó là biến nó thành
   * "khoá cứng" — đúng điều ngược lại với ý muốn.
   */
  private async widenModelWithinTx(tx: Tx, model: ParentModel, fields: VehicleDataFields) {
    const widen = <T>(current: T[], value: T | null): T[] | null =>
      value == null || current.length === 0 || current.includes(value) ? null : [...current, value];
    const seatCounts = widen(model.seatCounts, fields.seatCount);
    const fuelTypes = widen(model.fuelTypes, fields.fuelType);
    const transmissions = widen(model.transmissions, fields.transmission);
    if (!seatCounts && !fuelTypes && !transmissions) return;
    const data = {
      ...(seatCounts ? { seatCounts: [...seatCounts].sort((a, b) => a - b) } : {}),
      ...(fuelTypes ? { fuelTypes } : {}),
      ...(transmissions ? { transmissions } : {}),
    };
    await tx.vehicleCatalogModel.update({ where: { id: model.id }, data });
    // Cập nhật bản trong bộ nhớ để lượt ghi kế tiếp CÙNG transaction (nhập file) thấy mảng mới.
    if (seatCounts) model.seatCounts = data.seatCounts!;
    if (fuelTypes) model.fuelTypes = fuelTypes;
    if (transmissions) model.transmissions = transmissions;
  }

  /** Tên hãng/dòng là cột của ảnh chụp chợ — đồng bộ lại trong cùng transaction (ADR 0008). */
  private async resyncListings(tx: Tx, vehicleIds: string[]) {
    for (const vehicleId of vehicleIds) await this.listings.syncFromVehicle(vehicleId, tx);
  }

  private async recordReview(
    tx: Tx,
    actorUserId: string,
    action: string,
    id: string,
    after: Record<string, unknown>,
  ) {
    await this.audit.record(
      {
        actorUserId,
        actorScope: 'platform',
        action,
        targetType: 'vehicle_catalog_variant',
        targetId: id,
        after,
      },
      tx,
    );
  }

  private invalidSpec(message: string): BadRequestException {
    return new BadRequestException({ code: API_ERROR_CODE.CATALOG_MODEL_SPEC_INVALID, message });
  }

  private reviewInvalid(message: string): ConflictException {
    return new ConflictException({ code: API_ERROR_CODE.CATALOG_REVIEW_INVALID, message });
  }
}

/** Gộp trường DTO (chỉ trường được gửi) lên một bộ trường hiện có. */
function mergeFields(base: VehicleDataFields, dto: Partial<SaveVehicleDataDto>): VehicleDataFields {
  const out: VehicleDataFields = { ...base, featureKeys: [...base.featureKeys] };
  for (const key of VEHICLE_DATA_FIELD_KEYS) {
    const value = dto[key];
    if (value === undefined) continue;
    (out as unknown as Record<string, unknown>)[key] =
      key === 'featureKeys' ? [...new Set((value as string[] | null) ?? [])] : (value ?? null);
  }
  return out;
}

function fieldsFromVehicle(
  v: Prisma.VehicleGetPayload<{ select: typeof SOURCE_VEHICLE_SELECT }>,
): VehicleDataFields {
  return {
    seatCount: v.vehicleType === VEHICLE_TYPE.CAR ? v.seatCount : null,
    bodyType: v.vehicleType === VEHICLE_TYPE.CAR ? v.bodyType : null,
    fuelType: v.fuelType,
    transmission: v.transmission,
    engineDisplacementCc: v.engineDisplacementCc,
    horsepowerHp: v.horsepowerHp,
    lengthMm: v.lengthMm,
    widthMm: v.widthMm,
    heightMm: v.heightMm,
    curbWeightKg: v.curbWeightKg,
    fuelConsumptionCombined: decimalString(v.fuelConsumptionCombined),
    electricRangeKm: v.electricRangeKm,
    batteryCapacityKwh: decimalString(v.batteryCapacityKwh),
    featureKeys: v.features.map((f) => f.featureKey),
    listPrice: null,
    hourlyPrice: moneyString(v.hourlyPrice),
    weekdayPrice: moneyString(v.weekdayPrice),
    weekendPrice: moneyString(v.weekendPrice),
    monthlyPrice: moneyString(v.monthlyPrice),
    withDriverDailyPrice: moneyString(v.withDriverDailyPrice),
  };
}

function auditShape(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value == null || (Array.isArray(value) && value.length === 0)) continue;
    out[key] = value;
  }
  return out;
}
