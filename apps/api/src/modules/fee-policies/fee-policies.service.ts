import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  FEE_POLICY_STATUS,
  FEE_SCHEDULE_DEFAULTS,
  VEHICLE_TYPE,
  feePolicyActivationBlockers,
  maxTaxRatePercent,
  parseTaxRates,
  type FeePolicySnapshot,
  type FeePolicyValues,
  type OwnerCommissionTier,
  type PerVehicleTypeAmount,
  type TaxRatesByServiceType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeePolicyDto, UpsertFeePolicyDto } from './dto/fee-policy.dto';

const SELECT = {
  id: true,
  version: true,
  status: true,
  name: true,
  note: true,
  serviceFeePercent: true,
  holdMinAmount: true,
  holdPaymentWindowMinutes: true,
  freeCancelHours: true,
  depositPercent: true,
  depositMinAmount: true,
  depositMaxPercent: true,
  taxEnabled: true,
  taxRates: true,
  taxLegalBasis: true,
  taxPercent: true,
  taxLabel: true,
  tripInsuranceEnabled: true,
  tripInsurancePercent: true,
  vehicleProtectionEnabled: true,
  vehicleProtectionPercent: true,
  insurancePartnerName: true,
  customerPlatformFeeCar: true,
  customerPlatformFeeMotorbike: true,
  ownerCommissionTiers: true,
  vehicleProtectionDailyCar: true,
  vehicleProtectionDailyMotorbike: true,
  tripInsuranceDailyCar: true,
  tripInsuranceDailyMotorbike: true,
  effectiveFrom: true,
  effectiveTo: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { displayName: true } },
  activator: { select: { displayName: true } },
} satisfies Prisma.FeePolicySelect;

type Row = Prisma.FeePolicyGetPayload<{ select: typeof SELECT }>;

/**
 * Chính sách phí có PHIÊN BẢN — ADR 0028 điều 2–3, ADR 0029 (R3).
 *
 * Ba bất biến, xếp theo thứ tự sống còn:
 *
 *  1. **Đúng MỘT bản `active`** — unique một phần ở DB. `activate` lưu trữ bản cũ và mở bản mới
 *     trong cùng transaction, nên không có khoảng trống nào để một hold sinh ra "không policy".
 *  2. **Bản `active`/`archived` là BẤT BIẾN.** Đơn đã snapshot theo nó phải đọc lại được đúng số
 *     (ADR 0024). Muốn đổi số thì tạo nháp mới. `update` từ chối mọi thứ không phải `draft`.
 *  3. **Bật cổng phải có căn cứ** (ADR 0028 điều 4–5): `activate` chạy `feePolicyActivationBlockers`
 *     — cùng hàm web dùng để báo sớm — rồi DB CHECK chặn lần cuối. Không có đường nào thu thuế
 *     hay bảo hiểm mà chưa có tên loại thuế / đối tác thật.
 *
 * Reader chính: `findEffective()` — mọi nơi cần "policy hiện hành" (báo giá, duyệt yêu cầu,
 * đồng bộ listing) đều qua đây, không tự query bảng.
 */
@Injectable()
export class FeePoliciesService {
  private readonly logger = new Logger(FeePoliciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Bản đang hiệu lực → snapshot để tính phí, hoặc `null` khi chưa có bản nào.
   *
   * `null` KHÔNG ném: báo giá vẫn phải hiện được (không có phụ phí), còn bước cần policy để thu
   * tiền thật (`BookingHoldsService`) tự ném `FEE_POLICY_MISSING` — chỗ đó mới là lỗi cấu hình.
   */
  async findEffective(
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<FeePolicySnapshot | null> {
    const row = await db.feePolicy.findFirst({
      where: { status: FEE_POLICY_STATUS.ACTIVE },
      select: SELECT,
    });
    if (!row) {
      this.logger.warn('Không có chính sách phí nào đang hiệu lực — phụ phí chuyến tắt.');
      return null;
    }
    return toSnapshot(row);
  }

  async list(): Promise<FeePolicyDto[]> {
    const rows = await this.prisma.feePolicy.findMany({
      orderBy: { version: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async getOne(id: string): Promise<FeePolicyDto> {
    return toDto(await this.load(id));
  }

  async createDraft(actorUserId: string, dto: UpsertFeePolicyDto): Promise<FeePolicyDto> {
    assertDepositCoversTax(dto);
    const row = await this.prisma.$transaction(async (tx) => {
      const last = await tx.feePolicy.aggregate({ _max: { version: true } });
      const created = await tx.feePolicy.create({
        data: {
          id: newId(),
          version: (last._max.version ?? 0) + 1,
          status: FEE_POLICY_STATUS.DRAFT,
          createdBy: actorUserId,
          ...valuesData(dto, null),
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'fee_policy.create_draft',
          targetType: 'fee_policy',
          targetId: created.id,
          after: { version: created.version, ...auditValues(toValues(created)) },
        },
        tx,
      );
      return created;
    });
    return toDto(row);
  }

  async updateDraft(
    id: string,
    actorUserId: string,
    dto: UpsertFeePolicyDto,
  ): Promise<FeePolicyDto> {
    const before = await this.load(id);
    this.assertDraft(before);
    assertDepositCoversTax(dto);
    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.feePolicy.updateMany({
        where: { id, status: FEE_POLICY_STATUS.DRAFT },
        data: valuesData(dto, toValues(before)),
      });
      if (claimed.count === 0) throw notDraft(before.status);
      const after = await tx.feePolicy.findUniqueOrThrow({ where: { id }, select: SELECT });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'fee_policy.update_draft',
          targetType: 'fee_policy',
          targetId: id,
          before: auditValues(toValues(before)),
          after: auditValues(toValues(after)),
        },
        tx,
      );
      return after;
    });
    return toDto(row);
  }

  /**
   * Kích hoạt một bản nháp: lưu trữ bản đang hiệu lực (đóng `effectiveTo`) và mở bản này —
   * MỘT transaction, nên unique một phần ở DB không bao giờ bị vi phạm và không có khoảng trống.
   *
   * Không hồi tố: đơn/hold đã snapshot theo bản cũ giữ nguyên số của chúng (ADR 0024).
   */
  async activate(id: string, actorUserId: string): Promise<FeePolicyDto> {
    const draft = await this.load(id);
    this.assertDraft(draft);
    const blockers = feePolicyActivationBlockers(toValues(draft));
    if (blockers.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.FEE_POLICY_ACTIVATION_BLOCKED,
        message: 'Chính sách chưa đủ điều kiện kích hoạt',
        details: { blockers },
      });
    }

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.feePolicy.findFirst({
        where: { status: FEE_POLICY_STATUS.ACTIVE },
        select: { id: true, version: true },
      });
      if (previous) {
        await tx.feePolicy.update({
          where: { id: previous.id },
          data: { status: FEE_POLICY_STATUS.ARCHIVED, effectiveTo: now },
        });
      }
      const claimed = await tx.feePolicy.updateMany({
        where: { id, status: FEE_POLICY_STATUS.DRAFT },
        data: {
          status: FEE_POLICY_STATUS.ACTIVE,
          effectiveFrom: now,
          effectiveTo: null,
          activatedBy: actorUserId,
          activatedAt: now,
        },
      });
      // Hai admin cùng bấm: unique một phần đã chặn bản thứ hai ở DB, nhưng nói rõ hơn ở đây.
      if (claimed.count === 0) throw notDraft(draft.status);

      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'fee_policy.activate',
          targetType: 'fee_policy',
          targetId: id,
          before: { previousVersion: previous?.version ?? null },
          after: { version: draft.version, effectiveFrom: now.toISOString(), ...auditValues(toValues(draft)) },
        },
        tx,
      );
      return tx.feePolicy.findUniqueOrThrow({ where: { id }, select: SELECT });
    });
    return toDto(row);
  }

  /** Bỏ một bản nháp. Bản đã từng hiệu lực KHÔNG xoá được — đơn cũ trỏ vào nó. */
  async discardDraft(id: string, actorUserId: string): Promise<void> {
    const row = await this.load(id);
    this.assertDraft(row);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.feePolicy.deleteMany({ where: { id, status: FEE_POLICY_STATUS.DRAFT } });
      if (deleted.count === 0) throw notDraft(row.status);
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'fee_policy.discard_draft',
          targetType: 'fee_policy',
          targetId: id,
          before: { version: row.version },
        },
        tx,
      );
    });
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async load(id: string): Promise<Row> {
    const row = await this.prisma.feePolicy.findUnique({ where: { id }, select: SELECT });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy chính sách phí',
      });
    }
    return row;
  }

  private assertDraft(row: Row): void {
    if (row.status !== FEE_POLICY_STATUS.DRAFT) throw notDraft(row.status);
  }
}

/**
 * `depositPercent` ≥ mức thuế tổng cao nhất của bảng — cùng luật với blocker
 * `deposit_percent_below_tax_percent`, nhưng chặn ngay lúc LƯU NHÁP: CHECK
 * `fee_policies_deposit_covers_tax_check` áp cho mọi dòng, và để nó nổ là trả 500 thay vì một câu
 * 400 nói rõ ô nào sai.
 */
function assertDepositCoversTax(dto: UpsertFeePolicyDto): void {
  if (!dto.taxEnabled || !dto.taxRates) return;
  const rates = dto.taxRates as TaxRatesByServiceType;
  const required = maxTaxRatePercent(rates);
  if (dto.depositPercent < required) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: `% giữ chỗ của chủ xe phải ≥ mức thuế cao nhất (${required}%)`,
      details: [
        {
          field: 'depositPercent',
          constraints: { depositCoversTax: 'deposit_percent_below_tax_percent' },
        },
      ],
    });
  }
}

function notDraft(status: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.FEE_POLICY_NOT_DRAFT,
    message: 'Chỉ bản nháp mới sửa / kích hoạt / bỏ được — bản đã hiệu lực là bất biến',
    details: { status },
  });
}

function toValues(row: Row): FeePolicyValues {
  return {
    serviceFeePercent: Number(row.serviceFeePercent),
    holdMinAmount: row.holdMinAmount.toFixed(0),
    holdPaymentWindowMinutes: row.holdPaymentWindowMinutes,
    freeCancelHours: row.freeCancelHours,
    depositPercent: Number(row.depositPercent),
    depositMinAmount: row.depositMinAmount.toFixed(0),
    depositMaxPercent: Number(row.depositMaxPercent),
    taxEnabled: row.taxEnabled,
    // Hỏng/thiếu khoá ⇒ null — blocker `tax_requires_rates_and_basis` chặn kích hoạt (ADR 0068).
    taxRates: parseTaxRates(row.taxRates),
    taxLegalBasis: row.taxLegalBasis,
    taxPercent: row.taxPercent == null ? null : Number(row.taxPercent),
    taxLabel: row.taxLabel,
    tripInsuranceEnabled: row.tripInsuranceEnabled,
    tripInsurancePercent: row.tripInsurancePercent == null ? null : Number(row.tripInsurancePercent),
    vehicleProtectionEnabled: row.vehicleProtectionEnabled,
    vehicleProtectionPercent:
      row.vehicleProtectionPercent == null ? null : Number(row.vehicleProtectionPercent),
    insurancePartnerName: row.insurancePartnerName,
    customerPlatformFee: perVehicleType(row.customerPlatformFeeCar, row.customerPlatformFeeMotorbike),
    ownerCommissionTiers: parseCommissionTiers(row.ownerCommissionTiers),
    vehicleProtectionDailyAmount: perVehicleType(
      row.vehicleProtectionDailyCar,
      row.vehicleProtectionDailyMotorbike,
    ),
    tripInsuranceDailyAmount: perVehicleType(
      row.tripInsuranceDailyCar,
      row.tripInsuranceDailyMotorbike,
    ),
  };
}

/** Hai cột tiền của một bảng theo loại xe → `PerVehicleTypeAmount` (chuỗi VND nguyên). */
function perVehicleType(car: Prisma.Decimal, motorbike: Prisma.Decimal): PerVehicleTypeAmount {
  return { [VEHICLE_TYPE.CAR]: car.toFixed(0), [VEHICLE_TYPE.MOTORBIKE]: motorbike.toFixed(0) };
}

/**
 * Đọc `owner_commission_tiers` (jsonb) về mảng nấc. Phần tử hỏng bị BỎ, không ném: DB chỉ canh
 * "là một mảng", và một jsonb lỗi không được làm sập đường báo giá công khai.
 *
 * Bỏ phần tử hỏng không mở đường thu sai: bản nháp còn nấc hỏng thì `feePolicyActivationBlockers`
 * đọc chính kết quả này và chặn kích hoạt (thiếu ngày 1, thứ tự sai…), còn bản đã kích hoạt thì
 * bất biến và đã qua cổng đó.
 */
function parseCommissionTiers(raw: Prisma.JsonValue): OwnerCommissionTier[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const { fromDay, percent } = item as Record<string, unknown>;
    return typeof fromDay === 'number' &&
      Number.isInteger(fromDay) &&
      typeof percent === 'number' &&
      Number.isFinite(percent)
      ? [{ fromDay, percent }]
      : [];
  });
}

/** Snapshot đóng băng lên đơn/hold — chính là `values` + định danh phiên bản. */
export function toSnapshot(row: Row): FeePolicySnapshot {
  return { policyId: row.id, version: row.version, ...toValues(row) };
}

function toDto(row: Row): FeePolicyDto {
  const values = toValues(row);
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    name: row.name,
    note: row.note,
    ...values,
    effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    activatedByName: row.activator?.displayName ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    createdByName: row.creator?.displayName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activationBlockers: feePolicyActivationBlockers(values),
  };
}

/**
 * Payload Prisma từ DTO đã validate. Cổng TẮT thì xoá tỷ lệ LEGACY kèm — không để tỷ lệ mồ côi
 * trong DB.
 *
 * `base` = bộ số đang có của bản nháp (sửa) hoặc `null` (tạo mới). Trường v2 vắng mặt trên dây ⇒
 * giữ số của `base`, tạo mới thì lấy `FEE_SCHEDULE_DEFAULTS` — xem docblock `UpsertFeePolicyDto`.
 *
 * Biểu phí bảo hiểm KHÔNG bị xoá khi cổng tắt (khác tỷ lệ legacy): nó là biểu phí công bố của
 * đối tác, không phải "số đang áp", và tắt-rồi-bật một cổng không được bắt admin gõ lại bốn số.
 * Phép tính chỉ đọc nó khi cổng mở (`computeCustomerFees`).
 */
function valuesData(dto: UpsertFeePolicyDto, base: FeePolicyValues | null) {
  const platformFee = dto.customerPlatformFee ?? base?.customerPlatformFee ?? FEE_SCHEDULE_DEFAULTS.customerPlatformFee;
  const tiers = dto.ownerCommissionTiers ?? base?.ownerCommissionTiers ?? FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers;
  const vehicleDaily =
    dto.vehicleProtectionDailyAmount ??
    base?.vehicleProtectionDailyAmount ??
    FEE_SCHEDULE_DEFAULTS.vehicleProtectionDailyAmount;
  const tripDaily =
    dto.tripInsuranceDailyAmount ??
    base?.tripInsuranceDailyAmount ??
    FEE_SCHEDULE_DEFAULTS.tripInsuranceDailyAmount;
  return {
    name: dto.name.trim(),
    note: dto.note?.trim() || null,
    serviceFeePercent: new Prisma.Decimal(dto.serviceFeePercent ?? base?.serviceFeePercent ?? 0),
    holdMinAmount: new Prisma.Decimal(dto.holdMinAmount),
    holdPaymentWindowMinutes: dto.holdPaymentWindowMinutes,
    freeCancelHours: dto.freeCancelHours,
    depositPercent: new Prisma.Decimal(dto.depositPercent),
    depositMinAmount: new Prisma.Decimal(dto.depositMinAmount),
    depositMaxPercent: new Prisma.Decimal(dto.depositMaxPercent),
    taxEnabled: dto.taxEnabled,
    /*
     * ADR 0068: bảng mức theo loại dịch vụ + căn cứ pháp lý. Chỉ ba khoá × hai trường khai báo đi
     * vào jsonb — không để một khoá lạ lọt qua DTO thành dữ liệu chính sách. Hai cột một-mức cũ
     * (`tax_percent`/`tax_label`) luôn null ở bản mới: chúng chỉ còn để đọc lại chính sách ≤ v8.
     */
    taxRates:
      dto.taxEnabled && dto.taxRates
        ? (taxRatesJson(dto.taxRates as TaxRatesByServiceType) as Prisma.InputJsonObject)
        : Prisma.DbNull,
    taxLegalBasis: dto.taxEnabled ? dto.taxLegalBasis?.trim() || null : null,
    taxPercent: null,
    taxLabel: null,
    tripInsuranceEnabled: dto.tripInsuranceEnabled,
    tripInsurancePercent:
      dto.tripInsuranceEnabled && dto.tripInsurancePercent != null
        ? new Prisma.Decimal(dto.tripInsurancePercent)
        : null,
    vehicleProtectionEnabled: dto.vehicleProtectionEnabled,
    vehicleProtectionPercent:
      dto.vehicleProtectionEnabled && dto.vehicleProtectionPercent != null
        ? new Prisma.Decimal(dto.vehicleProtectionPercent)
        : null,
    insurancePartnerName:
      dto.tripInsuranceEnabled || dto.vehicleProtectionEnabled
        ? dto.insurancePartnerName?.trim() || null
        : null,
    customerPlatformFeeCar: new Prisma.Decimal(platformFee[VEHICLE_TYPE.CAR]),
    customerPlatformFeeMotorbike: new Prisma.Decimal(platformFee[VEHICLE_TYPE.MOTORBIKE]),
    // Chỉ hai trường khai báo — không để DTO (hay một khoá lạ lọt qua) thành cột jsonb.
    ownerCommissionTiers: tiers.map((t) => ({
      fromDay: t.fromDay,
      percent: t.percent,
    })) as Prisma.InputJsonArray,
    vehicleProtectionDailyCar: new Prisma.Decimal(vehicleDaily[VEHICLE_TYPE.CAR]),
    vehicleProtectionDailyMotorbike: new Prisma.Decimal(vehicleDaily[VEHICLE_TYPE.MOTORBIKE]),
    tripInsuranceDailyCar: new Prisma.Decimal(tripDaily[VEHICLE_TYPE.CAR]),
    tripInsuranceDailyMotorbike: new Prisma.Decimal(tripDaily[VEHICLE_TYPE.MOTORBIKE]),
  };
}

/** Bảng mức → jsonb, đúng ba khoá × hai trường (ADR 0068). */
function taxRatesJson(rates: TaxRatesByServiceType): Record<string, { vatPercent: number; pitPercent: number }> {
  return Object.fromEntries(
    Object.entries(rates).map(([type, rate]) => [
      type,
      { vatPercent: rate.vatPercent, pitPercent: rate.pitPercent },
    ]),
  );
}

function auditValues(v: FeePolicyValues): Record<string, unknown> {
  return {
    serviceFeePercent: v.serviceFeePercent,
    holdMinAmount: v.holdMinAmount,
    holdPaymentWindowMinutes: v.holdPaymentWindowMinutes,
    freeCancelHours: v.freeCancelHours,
    depositPercent: v.depositPercent,
    depositMinAmount: v.depositMinAmount,
    depositMaxPercent: v.depositMaxPercent,
    taxEnabled: v.taxEnabled,
    taxRates: v.taxRates,
    taxLegalBasis: v.taxLegalBasis,
    tripInsuranceEnabled: v.tripInsuranceEnabled,
    tripInsurancePercent: v.tripInsurancePercent ?? null,
    vehicleProtectionEnabled: v.vehicleProtectionEnabled,
    vehicleProtectionPercent: v.vehicleProtectionPercent ?? null,
    insurancePartnerName: v.insurancePartnerName ?? null,
    customerPlatformFee: v.customerPlatformFee,
    ownerCommissionTiers: v.ownerCommissionTiers,
    vehicleProtectionDailyAmount: v.vehicleProtectionDailyAmount,
    tripInsuranceDailyAmount: v.tripInsuranceDailyAmount,
  };
}
