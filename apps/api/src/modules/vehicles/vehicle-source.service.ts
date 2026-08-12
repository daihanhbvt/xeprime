import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  isVehicleSourceObligationReady,
  VEHICLE_SOURCE_TYPE,
  type VehicleSourceType,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCalendarDate } from '../../common/calendar-date';
import {
  SaveVehicleSourceDto,
  VehicleSourceContractFileDto,
  VehicleSourceDetailDto,
  VehicleSourceDto,
} from './dto/vehicle-source.dto';
import { VehicleContractsService } from './vehicle-contracts.service';

/**
 * Các trường của DTO thuộc biến thể nào — dùng để TỪ CHỐI trường lạc biến thể ở tầng 400,
 * để CHECK constraint của DB (migration 20260812100000) không bao giờ phải nổ thành 500.
 * Cột nào không nằm trong bảng này (contractFileIds, notes) là dùng chung cho mọi biến thể.
 */
const VARIANT_FIELDS = {
  [VEHICLE_SOURCE_TYPE.OWNED]: ['purchaseDate', 'purchasePrice', 'purchasePlace'],
  [VEHICLE_SOURCE_TYPE.FINANCED]: [
    'bankName',
    'contractNumber',
    'originalPrincipal',
    'monthlyPrincipal',
    'monthlyInterest',
    'interestRatePercent',
    'termMonths',
    'interestMethod',
    'paymentDay',
    'startDate',
    'endDate',
  ],
  [VEHICLE_SOURCE_TYPE.RENTED]: [
    'ownerName',
    'ownerPhone',
    'ownerEmail',
    'monthlyRent',
    'paymentDay',
    'startDate',
    'endDate',
  ],
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: [
    'ownerName',
    'ownerPhone',
    'ownerEmail',
    'commissionPercent',
    'startDate',
    'endDate',
  ],
} as const satisfies Record<VehicleSourceType, readonly (keyof SaveVehicleSourceDto)[]>;

/** Trường BẮT BUỘC theo biến thể — `owned` không đòi gì (hồ sơ mua xe là tuỳ chọn). */
const REQUIRED_FIELDS: Record<VehicleSourceType, readonly (keyof SaveVehicleSourceDto)[]> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: [],
  [VEHICLE_SOURCE_TYPE.FINANCED]: ['bankName'],
  [VEHICLE_SOURCE_TYPE.RENTED]: ['ownerName', 'monthlyRent'],
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: ['ownerName', 'commissionPercent'],
};

const ALL_VARIANT_FIELDS = [
  ...new Set(Object.values(VARIANT_FIELDS).flat()),
] as (keyof SaveVehicleSourceDto)[];

/**
 * Bản ghi Wave 4 cũ trong `contract_files_json` (`{url, name, size}` — URL bucket public).
 * KHÔNG BAO GIỜ trả `url` ra API nữa; giữ nguyên trong JSON để tiện ích di trú sau này còn
 * biết object gốc ở đâu. FE hiển thị mục `legacy` kèm yêu cầu tải lên lại.
 */
interface LegacyContractEntry {
  url: string;
  name: string;
  size?: number;
}

/** JSON hiện hành: mảng trộn `string` (id file riêng tư) + object legacy Wave 4. */
function splitContractJson(json: Prisma.JsonValue | null | undefined): {
  ids: string[];
  legacy: LegacyContractEntry[];
} {
  const ids: string[] = [];
  const legacy: LegacyContractEntry[] = [];
  if (Array.isArray(json)) {
    for (const entry of json) {
      if (typeof entry === 'string') {
        ids.push(entry);
      } else if (entry && typeof entry === 'object' && 'url' in entry && 'name' in entry) {
        legacy.push(entry as unknown as LegacyContractEntry);
      }
    }
  }
  return { ids, legacy };
}

/**
 * Hồ sơ nguồn xe & tài chính (Wave 4, siết ở 4.1) — writer DUY NHẤT của `vehicle_source_details`.
 *
 * Lưu là REPLACE trọn hồ sơ theo biến thể: đổi hình thức nguồn (thao tác nhạy cảm, FE phải
 * xác nhận trước) thì mọi cột của biến thể cũ về NULL và `vehicles.source_type` được đồng bộ
 * trong CÙNG transaction với audit — không có trạng thái nửa vời.
 *
 * Hợp đồng đính kèm: chỉ nhận ID file riêng tư do server phát (`VehicleContractsService`),
 * kiểm từng id thuộc đúng tenant + xe + `ready` TRONG transaction; id bị gỡ được đánh dấu
 * `deleted`. Không còn URL nào — public hay signed — nằm trong hồ sơ hay response.
 */
@Injectable()
export class VehicleSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contracts: VehicleContractsService,
  ) {}

  async getSource(tenantId: string, vehicleId: string): Promise<VehicleSourceDto> {
    const vehicle = await this.findVehicle(tenantId, vehicleId);
    const detail = await this.prisma.vehicleSourceDetail.findUnique({
      where: { vehicleId: vehicle.id },
    });
    if (!detail) return { sourceType: vehicle.sourceType, detail: null };

    const { ids, legacy } = splitContractJson(detail.contractFiles);
    const contractFiles = [
      ...(await this.contracts.listByIds(tenantId, vehicle.id, ids)),
      ...legacy.map(toLegacyDto),
    ];
    return { sourceType: vehicle.sourceType, detail: toDetailDto(detail, contractFiles) };
  }

  async saveSource(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: SaveVehicleSourceDto,
  ): Promise<VehicleSourceDto> {
    const vehicle = await this.findVehicle(tenantId, vehicleId);
    const sourceType = dto.sourceType as VehicleSourceType;
    this.assertVariantShape(sourceType, dto);
    this.assertDateRange(dto);

    const data = detailData(sourceType, dto);
    const typeChanged = vehicle.sourceType !== sourceType;
    const nextIds = [...new Set(dto.contractFileIds ?? [])];

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.vehicleSourceDetail.findUnique({
        where: { vehicleId: vehicle.id },
      });

      // Từng id phải là file riêng tư `ready` của ĐÚNG tenant + xe này — id lạ/xe khác/tenant
      // khác/pending/deleted đều 400. Đây là chốt thật; DTO chỉ chặn hình dạng ULID.
      await this.contracts.assertAttachable(tx, tenantId, vehicle.id, nextIds);

      const previous = splitContractJson(existing?.contractFiles);
      // Mục legacy Wave 4 giữ nguyên trong JSON (chờ di trú/tải lên lại) — client không gỡ
      // được chúng qua API này, và URL của chúng không bao giờ quay lại response.
      const contractFilesJson = [
        ...nextIds,
        ...previous.legacy,
      ] as unknown as Prisma.InputJsonValue;

      if (existing) {
        await tx.vehicleSourceDetail.update({
          where: { id: existing.id },
          data: { ...data, contractFiles: contractFilesJson },
        });
      } else {
        await tx.vehicleSourceDetail.create({
          data: {
            id: newId(),
            tenantId,
            vehicleId: vehicle.id,
            ...data,
            contractFiles: contractFilesJson,
          },
        });
      }

      // File bị gỡ khỏi hồ sơ → đánh dấu deleted (object KHÔNG xoá tự động — dọn có kiểm soát).
      const detachedIds = previous.ids.filter((id) => !nextIds.includes(id));
      await this.contracts.markDetached(tx, tenantId, vehicle.id, detachedIds);

      // Scalar trên `vehicles` là nguồn của badge/filter — đồng bộ trong cùng transaction.
      if (typeChanged) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { sourceType },
        });
      }

      // Hồ sơ tài chính là dữ liệu nhạy cảm: mọi lần lưu đều để lại vết đủ before/after.
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.source.update',
          targetType: 'vehicle',
          targetId: vehicle.id,
          before: existing
            ? ({
                sourceType: existing.sourceType,
                contractFileIds: previous.ids,
              } as unknown as Prisma.InputJsonValue)
            : { sourceType: vehicle.sourceType, detail: null },
          after: dto as unknown as Prisma.InputJsonValue,
        },
        tx,
      );

      const attachedIds = nextIds.filter((id) => !previous.ids.includes(id));
      if (attachedIds.length > 0 || detachedIds.length > 0) {
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.contract.attach_change',
            targetType: 'vehicle',
            targetId: vehicle.id,
            before: { fileIds: previous.ids },
            after: { fileIds: nextIds, attached: attachedIds, detached: detachedIds },
          },
          tx,
        );
      }

      // Đổi HÌNH THỨC là sự kiện riêng — màn audit lọc được mà không phải diff hai JSON.
      if (typeChanged) {
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.source_type.change',
            targetType: 'vehicle',
            targetId: vehicle.id,
            before: { sourceType: vehicle.sourceType },
            after: { sourceType },
          },
          tx,
        );
      }
    });

    return this.getSource(tenantId, vehicleId);
  }

  private async findVehicle(
    tenantId: string,
    id: string,
  ): Promise<{ id: string; sourceType: string }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, sourceType: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy xe',
      });
    }
    return vehicle;
  }

  /** Trường bắt buộc phải có, trường của biến thể khác phải vắng — lỗi 400 nói rõ trường nào. */
  private assertVariantShape(sourceType: VehicleSourceType, dto: SaveVehicleSourceDto): void {
    const allowed = new Set<keyof SaveVehicleSourceDto>(VARIANT_FIELDS[sourceType]);

    const stray = ALL_VARIANT_FIELDS.filter(
      (field) => !allowed.has(field) && dto[field] != null && dto[field] !== '',
    );
    if (stray.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Trường không thuộc hình thức nguồn xe đã chọn',
        details: { sourceType, stray },
      });
    }

    const missing = REQUIRED_FIELDS[sourceType].filter(
      (field) => dto[field] == null || dto[field] === '',
    );
    if (missing.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu trường bắt buộc của hình thức nguồn xe',
        details: { sourceType, missing },
      });
    }
  }

  /**
   * Ngày kết thúc không được trước ngày bắt đầu — 400 có kiểm soát, để CHECK `vsd_date_order`
   * của DB là lớp chốt cuối chứ không phải nguồn lỗi 500. (Từng ngày đã qua `@IsCalendarDate`.)
   */
  private assertDateRange(dto: SaveVehicleSourceDto): void {
    if (!dto.startDate || !dto.endDate) return;
    const start = parseCalendarDate(dto.startDate);
    const end = parseCalendarDate(dto.endDate);
    if (start && end && end < start) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Ngày kết thúc hợp đồng không được trước ngày bắt đầu',
        details: { startDate: dto.startDate, endDate: dto.endDate },
      });
    }
  }
}

/** DTO → dữ liệu ghi DB: biến thể nào ghi cột đó, mọi cột khác VỀ NULL (replace trọn hồ sơ). */
function detailData(
  sourceType: VehicleSourceType,
  dto: SaveVehicleSourceDto,
): Omit<
  Prisma.VehicleSourceDetailUncheckedCreateInput,
  'id' | 'tenantId' | 'vehicleId' | 'contractFiles'
> {
  const owned = sourceType === VEHICLE_SOURCE_TYPE.OWNED;
  const financed = sourceType === VEHICLE_SOURCE_TYPE.FINANCED;
  const rented = sourceType === VEHICLE_SOURCE_TYPE.RENTED;
  const partnership = sourceType === VEHICLE_SOURCE_TYPE.PARTNERSHIP;
  const hasOwner = rented || partnership;

  return {
    sourceType,
    purchaseDate: owned ? toDate(dto.purchaseDate) : null,
    purchasePrice: owned ? toDecimal(dto.purchasePrice) : null,
    purchasePlace: owned ? trimOrNull(dto.purchasePlace) : null,

    bankName: financed ? trimOrNull(dto.bankName) : null,
    contractNumber: financed ? trimOrNull(dto.contractNumber) : null,
    originalPrincipal: financed ? toDecimal(dto.originalPrincipal) : null,
    monthlyPrincipal: financed ? toDecimal(dto.monthlyPrincipal) : null,
    monthlyInterest: financed ? toDecimal(dto.monthlyInterest) : null,
    interestRatePercent: financed ? toDecimal(dto.interestRatePercent) : null,
    termMonths: financed ? (dto.termMonths ?? null) : null,
    interestMethod: financed ? (dto.interestMethod ?? null) : null,

    ownerName: hasOwner ? trimOrNull(dto.ownerName) : null,
    ownerPhone: hasOwner ? trimOrNull(dto.ownerPhone) : null,
    ownerEmail: hasOwner ? trimOrNull(dto.ownerEmail) : null,
    monthlyRent: rented ? toDecimal(dto.monthlyRent) : null,
    commissionPercent: partnership ? toDecimal(dto.commissionPercent) : null,

    paymentDay: financed || rented ? (dto.paymentDay ?? null) : null,
    startDate: owned ? null : toDate(dto.startDate),
    endDate: owned ? null : toDate(dto.endDate),
    notes: trimOrNull(dto.notes),
  };
}

type DetailRow = Prisma.VehicleSourceDetailGetPayload<Record<string, never>>;

function toDetailDto(
  row: DetailRow,
  contractFiles: VehicleSourceContractFileDto[],
): VehicleSourceDetailDto {
  const principal = row.monthlyPrincipal;
  const interest = row.monthlyInterest;
  // Tổng phải đóng mỗi tháng = gốc + lãi; chỉ tính khi có ít nhất một vế.
  const monthlyTotal =
    principal || interest
      ? (principal ?? new Prisma.Decimal(0)).plus(interest ?? new Prisma.Decimal(0))
      : null;

  const dto: VehicleSourceDetailDto = {
    sourceType: row.sourceType,
    purchaseDate: toDateString(row.purchaseDate),
    purchasePrice: toMoneyString(row.purchasePrice),
    purchasePlace: row.purchasePlace,
    bankName: row.bankName,
    contractNumber: row.contractNumber,
    originalPrincipal: toMoneyString(row.originalPrincipal),
    monthlyPrincipal: toMoneyString(row.monthlyPrincipal),
    monthlyInterest: toMoneyString(row.monthlyInterest),
    monthlyTotal: toMoneyString(monthlyTotal),
    interestRatePercent: row.interestRatePercent ? row.interestRatePercent.toString() : null,
    termMonths: row.termMonths,
    interestMethod: row.interestMethod,
    ownerName: row.ownerName,
    ownerPhone: row.ownerPhone,
    ownerEmail: row.ownerEmail,
    monthlyRent: toMoneyString(row.monthlyRent),
    commissionPercent: row.commissionPercent ? row.commissionPercent.toString() : null,
    paymentDay: row.paymentDay,
    startDate: toDateString(row.startDate),
    endDate: toDateString(row.endDate),
    contractFiles,
    notes: row.notes,
    obligationReady: false,
    updatedAt: row.updatedAt.toISOString(),
  };
  dto.obligationReady = isVehicleSourceObligationReady(dto);
  return dto;
}

function toLegacyDto(entry: LegacyContractEntry): VehicleSourceContractFileDto {
  // KHÔNG trả `entry.url` — mục legacy chỉ còn tên/size + trạng thái cần tải lên lại.
  return {
    id: null,
    name: entry.name,
    mimeType: null,
    size: entry.size ?? null,
    status: 'legacy',
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDecimal(value: string | null | undefined): Prisma.Decimal | null {
  return value == null || value === '' ? null : new Prisma.Decimal(value);
}

/** `YYYY-MM-DD` → Date UTC nửa đêm — cột DATE, không có giờ để múi giờ làm lệch ngày. */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Tiền VND: bỏ phần lẻ .00 của Decimal(14,2) cho khớp convention `toFixed(0)` của vehicles. */
function toMoneyString(value: Prisma.Decimal | null): string | null {
  return value ? value.toFixed(0) : null;
}
