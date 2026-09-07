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
  feePolicyActivationBlockers,
  type FeePolicySnapshot,
  type FeePolicyValues,
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
  taxEnabled: true,
  taxPercent: true,
  taxLabel: true,
  tripInsuranceEnabled: true,
  tripInsurancePercent: true,
  vehicleProtectionEnabled: true,
  vehicleProtectionPercent: true,
  insurancePartnerName: true,
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
    const row = await this.prisma.$transaction(async (tx) => {
      const last = await tx.feePolicy.aggregate({ _max: { version: true } });
      const created = await tx.feePolicy.create({
        data: {
          id: newId(),
          version: (last._max.version ?? 0) + 1,
          status: FEE_POLICY_STATUS.DRAFT,
          createdBy: actorUserId,
          ...valuesData(dto),
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
          after: { version: created.version, ...auditValues(dto) },
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
    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.feePolicy.updateMany({
        where: { id, status: FEE_POLICY_STATUS.DRAFT },
        data: valuesData(dto),
      });
      if (claimed.count === 0) throw notDraft(before.status);
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'fee_policy.update_draft',
          targetType: 'fee_policy',
          targetId: id,
          before: auditValues(toValues(before)),
          after: auditValues(dto),
        },
        tx,
      );
      return tx.feePolicy.findUniqueOrThrow({ where: { id }, select: SELECT });
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
    taxEnabled: row.taxEnabled,
    taxPercent: row.taxPercent == null ? null : Number(row.taxPercent),
    taxLabel: row.taxLabel,
    tripInsuranceEnabled: row.tripInsuranceEnabled,
    tripInsurancePercent: row.tripInsurancePercent == null ? null : Number(row.tripInsurancePercent),
    vehicleProtectionEnabled: row.vehicleProtectionEnabled,
    vehicleProtectionPercent:
      row.vehicleProtectionPercent == null ? null : Number(row.vehicleProtectionPercent),
    insurancePartnerName: row.insurancePartnerName,
  };
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

/** Payload Prisma từ DTO đã validate. Cổng TẮT thì xoá số kèm — không để tỷ lệ mồ côi trong DB. */
function valuesData(dto: UpsertFeePolicyDto) {
  return {
    name: dto.name.trim(),
    note: dto.note?.trim() || null,
    serviceFeePercent: new Prisma.Decimal(dto.serviceFeePercent),
    holdMinAmount: new Prisma.Decimal(dto.holdMinAmount),
    holdPaymentWindowMinutes: dto.holdPaymentWindowMinutes,
    freeCancelHours: dto.freeCancelHours,
    taxEnabled: dto.taxEnabled,
    taxPercent: dto.taxEnabled && dto.taxPercent != null ? new Prisma.Decimal(dto.taxPercent) : null,
    taxLabel: dto.taxEnabled ? dto.taxLabel?.trim() || null : null,
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
  };
}

function auditValues(v: FeePolicyValues | UpsertFeePolicyDto): Record<string, unknown> {
  return {
    serviceFeePercent: v.serviceFeePercent,
    holdMinAmount: v.holdMinAmount,
    holdPaymentWindowMinutes: v.holdPaymentWindowMinutes,
    freeCancelHours: v.freeCancelHours,
    taxEnabled: v.taxEnabled,
    taxPercent: v.taxPercent ?? null,
    tripInsuranceEnabled: v.tripInsuranceEnabled,
    tripInsurancePercent: v.tripInsurancePercent ?? null,
    vehicleProtectionEnabled: v.vehicleProtectionEnabled,
    vehicleProtectionPercent: v.vehicleProtectionPercent ?? null,
    insurancePartnerName: v.insurancePartnerName ?? null,
  };
}
