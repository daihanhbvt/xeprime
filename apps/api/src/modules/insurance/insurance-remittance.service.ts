import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PROVIDER,
  INSURANCE_REMITTANCE_LIMITS,
  INSURANCE_REMITTANCE_STATUS,
  insuranceRemittanceCommission,
  type InsuranceRemittanceStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { isUniqueViolation } from '../../common/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  REMITTANCE_DEFAULT_LIMIT,
  REMITTANCE_MAX_LIMIT,
  type CreateInsuranceRemittanceDto,
  type InsuranceRemittanceDto,
  type InsuranceRemittanceLineDto,
  type InsuranceRemittanceListQueryDto,
  type InsuranceRemittancePendingDto,
  type PayInsuranceRemittanceDto,
} from './dto/insurance-remittance.dto';

/** Hợp đồng PHẢI TRẢ hãng: đã cấp, hoặc đang bồi thường (vẫn là hợp đồng đã mua). */
const PAYABLE_STATUSES = [INSURANCE_POLICY_STATUS.ISSUED, INSURANCE_POLICY_STATUS.CLAIM];
/** Việt Nam UTC+7, không DST. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const ZERO = new Prisma.Decimal(0);

type RemittanceRow = Prisma.InsurancePremiumRemittanceGetPayload<object>;

/**
 * BẢNG KÊ TRẢ PHÍ cho hãng bảo hiểm — ADR 0088 điều 6. Writer DUY NHẤT của
 * `insurance_premium_remittances` và của cột `booking_insurance_policies.remittance_id`.
 *
 * Tiền phí bảo hiểm khách trả nằm trong khoản giữ chỗ, là tiền XePrime GIỮ HỘ hãng (ADR 0033 điều
 * 4). Khi hợp đồng được cấp, nó thành khoản PHẢI TRẢ hãng. Mỗi tháng admin lập một bảng kê:
 *
 *   tổng phí các hợp đồng đã cấp chưa kê (cấp trước hết tháng) − hoa hồng đại lý = phải trả hãng
 *
 * rồi chốt số (gửi hãng đối chiếu, xuất CSV) và ghi nhận chuyển khoản. Gom hợp đồng bằng
 * `updateMany … WHERE remittance_id IS NULL` trong CÙNG transaction tạo bảng kê: hai admin bấm cùng
 * lúc thì một hợp đồng chỉ rơi vào một bảng (cột là một FK đơn — không thể nằm ở hai nơi), và
 * `UNIQUE (provider, period_month)` chặn hai bảng cho cùng một tháng.
 */
@Injectable()
export class InsuranceRemittanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: InsuranceRemittanceListQueryDto): Promise<{
    data: InsuranceRemittanceDto[];
    meta: PaginationMeta;
  }> {
    const paging = resolvePaging(query, REMITTANCE_DEFAULT_LIMIT, REMITTANCE_MAX_LIMIT);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.insurancePremiumRemittance.findMany({
        orderBy: [{ periodMonth: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.insurancePremiumRemittance.count(),
    ]);
    const extras = await this.extrasFor(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toDto(r, extras.get(r.id))),
      meta: paginationMeta(paging, total),
    };
  }

  async detail(id: string): Promise<InsuranceRemittanceDto> {
    const row = await this.find(id);
    return toDto(row, (await this.extrasFor([id])).get(id));
  }

  /** Hợp đồng đã cấp mà chưa kê — để admin biết tháng nào còn việc. */
  async pending(): Promise<InsuranceRemittancePendingDto> {
    const where = unremittedWhere(null);
    const agg = await this.prisma.bookingInsurancePolicy.aggregate({
      where,
      _count: { _all: true },
      _sum: { premiumAmount: true },
      _min: { issuedAt: true },
    });
    return {
      policyCount: agg._count._all,
      grossPremium: (agg._sum.premiumAmount ?? ZERO).toFixed(0),
      oldestIssuedAt: agg._min.issuedAt?.toISOString() ?? null,
    };
  }

  async lines(
    id: string,
    query: InsuranceRemittanceListQueryDto,
  ): Promise<{ data: InsuranceRemittanceLineDto[]; meta: PaginationMeta }> {
    await this.find(id);
    const paging = resolvePaging(query, REMITTANCE_DEFAULT_LIMIT, REMITTANCE_MAX_LIMIT);
    const where = { remittanceId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.bookingInsurancePolicy.findMany({
        where,
        select: LINE_SELECT,
        orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
        skip: paging.skip,
        take: paging.limit,
      }),
      this.prisma.bookingInsurancePolicy.count({ where }),
    ]);
    return { data: rows.map(toLineDto), meta: paginationMeta(paging, total) };
  }

  /** CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt) của toàn bộ bảng kê — gửi hãng đối chiếu. */
  async exportCsv(id: string): Promise<{ file: Buffer; fileName: string }> {
    const row = await this.find(id);
    const lines = await this.prisma.bookingInsurancePolicy.findMany({
      where: { remittanceId: id },
      select: LINE_SELECT,
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
    });
    const header = [
      'STT',
      'Mã đơn XePrime',
      'Số hợp đồng MIC',
      'Số GCN',
      'Biển số',
      'Khách thuê',
      'Hiệu lực từ',
      'Hiệu lực đến',
      'Ngày cấp',
      'Phí khách trả (VND)',
      'Phí MIC tính (VND)',
      'Thử nghiệm',
    ];
    const body = lines.map((l, i) => {
      const d = toLineDto(l);
      return [
        String(i + 1),
        d.bookingCode,
        d.contractNumber ?? '',
        d.certificateNumber ?? '',
        d.plateNumber ?? '',
        d.customerName,
        vnDateTime(l.coverageFrom),
        vnDateTime(l.coverageTo),
        vnDateTime(l.issuedAt),
        d.premiumAmount,
        d.partnerPremiumAmount ?? '',
        d.isTest ? 'Có' : '',
      ];
    });
    const summary = [
      [],
      ['Kỳ kê', monthKey(row.periodMonth)],
      ['Số hợp đồng', String(row.policyCount)],
      ['Tổng phí', row.grossPremium.toFixed(0)],
      [`Hoa hồng đại lý (${row.commissionPercent.toFixed(2)}%)`, row.commissionAmount.toFixed(0)],
      ['Phải trả', row.payableAmount.toFixed(0)],
    ];
    const csv = [header, ...body, ...summary]
      .map((cells) => cells.map(csvCell).join(','))
      .join('\r\n');
    return {
      file: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, 'utf8')]),
      fileName: `bang-ke-bao-hiem-mic-${monthKey(row.periodMonth)}.csv`,
    };
  }

  async create(
    dto: CreateInsuranceRemittanceDto,
    actorUserId: string,
  ): Promise<InsuranceRemittanceDto> {
    const commission = Number(dto.commissionPercent);
    if (commission > INSURANCE_REMITTANCE_LIMITS.commissionPercentMax) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Hoa hồng đại lý tối đa ${INSURANCE_REMITTANCE_LIMITS.commissionPercentMax}%`,
        details: { field: 'commissionPercent' },
      });
    }
    const { periodMonth, periodEnd } = periodOf(dto.periodMonth);
    // Kỳ chưa kết thúc thì số còn chạy — bảng kê chốt rồi mà còn hợp đồng mới rơi vào kỳ đó là sai.
    if (periodEnd.getTime() > Date.now()) {
      throw new BadRequestException({
        code: API_ERROR_CODE.INSURANCE_REMITTANCE_EMPTY,
        message: 'Tháng này chưa kết thúc - lập bảng kê sau ngày cuối tháng',
      });
    }

    const id = newId();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.insurancePremiumRemittance.create({
          data: {
            id,
            provider: INSURANCE_PROVIDER.MIC,
            periodMonth,
            status: INSURANCE_REMITTANCE_STATUS.DRAFT,
            policyCount: 0,
            grossPremium: ZERO,
            commissionPercent: new Prisma.Decimal(dto.commissionPercent),
            commissionAmount: ZERO,
            payableAmount: ZERO,
            note: dto.note || null,
            createdBy: actorUserId,
          },
        });
        const { count } = await tx.bookingInsurancePolicy.updateMany({
          where: unremittedWhere(periodEnd),
          data: { remittanceId: id },
        });
        if (count === 0) {
          throw new BadRequestException({
            code: API_ERROR_CODE.INSURANCE_REMITTANCE_EMPTY,
            message: 'Không có hợp đồng đã cấp nào chưa kê tới hết tháng này',
          });
        }
        const sum = await tx.bookingInsurancePolicy.aggregate({
          where: { remittanceId: id },
          _sum: { premiumAmount: true },
        });
        const gross = (sum._sum.premiumAmount ?? ZERO).toFixed(0);
        const commissionAmount = insuranceRemittanceCommission(gross, dto.commissionPercent);
        const row = await tx.insurancePremiumRemittance.update({
          where: { id },
          data: {
            policyCount: count,
            grossPremium: new Prisma.Decimal(gross),
            commissionAmount: new Prisma.Decimal(commissionAmount),
            payableAmount: new Prisma.Decimal(gross).minus(commissionAmount),
          },
        });
        await this.audit.record(
          {
            tenantId: null,
            actorUserId,
            actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
            action: 'insurance_remittance.create',
            targetType: 'insurance_remittance',
            targetId: id,
            after: auditView(row),
          },
          tx,
        );
        return row;
      });
      return toDto(created, (await this.extrasFor([id])).get(id));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: `Tháng ${dto.periodMonth} đã có bảng kê`,
        });
      }
      throw err;
    }
  }

  async finalize(id: string, actorUserId: string): Promise<InsuranceRemittanceDto> {
    return this.transition(id, actorUserId, INSURANCE_REMITTANCE_STATUS.DRAFT, 'finalize', () => ({
      status: INSURANCE_REMITTANCE_STATUS.FINALIZED,
      finalizedAt: new Date(),
      finalizedBy: actorUserId,
    }));
  }

  async pay(
    id: string,
    dto: PayInsuranceRemittanceDto,
    actorUserId: string,
  ): Promise<InsuranceRemittanceDto> {
    if (!(Number(dto.paidAmount) > 0)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Số tiền đã chuyển phải lớn hơn 0',
        details: { field: 'paidAmount' },
      });
    }
    return this.transition(
      id,
      actorUserId,
      INSURANCE_REMITTANCE_STATUS.FINALIZED,
      'pay',
      (row) => ({
        status: INSURANCE_REMITTANCE_STATUS.PAID,
        paidAmount: new Prisma.Decimal(dto.paidAmount),
        paidAt: new Date(dto.paidAt),
        bankReference: dto.bankReference,
        paidRecordedBy: actorUserId,
        ...(dto.note ? { note: row.note ? `${row.note}\n${dto.note}` : dto.note } : {}),
      }),
    );
  }

  /** Xoá bảng kê NHÁP — hợp đồng được nhả về "chưa kê" (FK `ON DELETE SET NULL`). */
  async remove(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.insurancePremiumRemittance.findUnique({ where: { id } });
      if (!row) throw notFound();
      const { count } = await tx.insurancePremiumRemittance.deleteMany({
        where: { id, status: INSURANCE_REMITTANCE_STATUS.DRAFT },
      });
      if (count !== 1) throw stateInvalid(row.status as InsuranceRemittanceStatus);
      await this.audit.record(
        {
          tenantId: null,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'insurance_remittance.delete',
          targetType: 'insurance_remittance',
          targetId: id,
          before: auditView(row),
        },
        tx,
      );
    });
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async find(id: string): Promise<RemittanceRow> {
    const row = await this.prisma.insurancePremiumRemittance.findUnique({ where: { id } });
    if (!row) throw notFound();
    return row;
  }

  /** Chuyển trạng thái có điều kiện — `updateMany` với trạng thái nguồn trong WHERE (không đua). */
  private async transition(
    id: string,
    actorUserId: string,
    from: InsuranceRemittanceStatus,
    action: string,
    data: (row: RemittanceRow) => Prisma.InsurancePremiumRemittanceUpdateManyMutationInput,
  ): Promise<InsuranceRemittanceDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.insurancePremiumRemittance.findUnique({ where: { id } });
      if (!before) throw notFound();
      const { count } = await tx.insurancePremiumRemittance.updateMany({
        where: { id, status: from },
        data: data(before),
      });
      if (count !== 1) throw stateInvalid(before.status as InsuranceRemittanceStatus);
      const after = await tx.insurancePremiumRemittance.findUniqueOrThrow({ where: { id } });
      await this.audit.record(
        {
          tenantId: null,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: `insurance_remittance.${action}`,
          targetType: 'insurance_remittance',
          targetId: id,
          before: auditView(before),
          after: auditView(after),
        },
        tx,
      );
      return after;
    });
    return toDto(updated, (await this.extrasFor([id])).get(id));
  }

  /** Tổng phí hãng tính + số GCN thử nghiệm của từng bảng kê — một câu gộp cho cả trang. */
  private async extrasFor(ids: string[]): Promise<Map<string, Extras>> {
    if (ids.length === 0) return new Map();
    const [sums, tests] = await Promise.all([
      this.prisma.bookingInsurancePolicy.groupBy({
        by: ['remittanceId'],
        where: { remittanceId: { in: ids } },
        _sum: { partnerPremiumAmount: true },
      }),
      this.prisma.bookingInsurancePolicy.groupBy({
        by: ['remittanceId'],
        where: { remittanceId: { in: ids }, isTest: true },
        _count: { _all: true },
      }),
    ]);
    const map = new Map<string, Extras>();
    for (const id of ids) map.set(id, { partnerPremiumTotal: ZERO, testPolicyCount: 0 });
    for (const s of sums) {
      if (s.remittanceId)
        map.get(s.remittanceId)!.partnerPremiumTotal = s._sum.partnerPremiumAmount ?? ZERO;
    }
    for (const t of tests) {
      if (t.remittanceId) map.get(t.remittanceId)!.testPolicyCount = t._count._all;
    }
    return map;
  }
}

interface Extras {
  partnerPremiumTotal: Prisma.Decimal;
  testPolicyCount: number;
}

const LINE_SELECT = {
  id: true,
  premiumAmount: true,
  partnerPremiumAmount: true,
  partnerContractNumber: true,
  certificateNumber: true,
  coverageFrom: true,
  coverageTo: true,
  issuedAt: true,
  isTest: true,
  booking: {
    select: { code: true, customerName: true, vehicle: { select: { plateNumber: true } } },
  },
} satisfies Prisma.BookingInsurancePolicySelect;

type LineRow = Prisma.BookingInsurancePolicyGetPayload<{ select: typeof LINE_SELECT }>;

/** Hợp đồng đã cấp, chưa kê, cấp TRƯỚC `before` (null = không giới hạn). */
function unremittedWhere(before: Date | null): Prisma.BookingInsurancePolicyWhereInput {
  return {
    status: { in: PAYABLE_STATUSES },
    remittanceId: null,
    issuedAt: before ? { not: null, lt: before } : { not: null },
  };
}

/** `YYYY-MM` → ngày đầu tháng (cột DATE) + mốc 00:00 giờ Việt Nam của ngày đầu tháng SAU. */
export function periodOf(month: string): { periodMonth: Date; periodEnd: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return {
    periodMonth: new Date(Date.UTC(y, m - 1, 1)),
    periodEnd: new Date(Date.UTC(y, m, 1) - VN_OFFSET_MS),
  };
}

function monthKey(periodMonth: Date): string {
  return periodMonth.toISOString().slice(0, 7);
}

function toDto(r: RemittanceRow, extras?: Extras): InsuranceRemittanceDto {
  return {
    id: r.id,
    provider: r.provider,
    periodMonth: monthKey(r.periodMonth),
    status: r.status as InsuranceRemittanceStatus,
    policyCount: r.policyCount,
    grossPremium: r.grossPremium.toFixed(0),
    commissionPercent: r.commissionPercent.toFixed(2),
    commissionAmount: r.commissionAmount.toFixed(0),
    payableAmount: r.payableAmount.toFixed(0),
    partnerPremiumTotal: (extras?.partnerPremiumTotal ?? ZERO).toFixed(0),
    testPolicyCount: extras?.testPolicyCount ?? 0,
    paidAmount: r.paidAmount?.toFixed(0) ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
    bankReference: r.bankReference,
    note: r.note,
    finalizedAt: r.finalizedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function toLineDto(l: LineRow): InsuranceRemittanceLineDto {
  return {
    policyId: l.id,
    bookingCode: l.booking.code,
    contractNumber: l.partnerContractNumber,
    certificateNumber: l.certificateNumber,
    plateNumber: l.booking.vehicle.plateNumber,
    customerName: l.booking.customerName,
    coverageFrom: l.coverageFrom?.toISOString() ?? null,
    coverageTo: l.coverageTo?.toISOString() ?? null,
    issuedAt: l.issuedAt?.toISOString() ?? null,
    premiumAmount: l.premiumAmount.toFixed(0),
    partnerPremiumAmount: l.partnerPremiumAmount?.toFixed(0) ?? null,
    isTest: l.isTest,
  };
}

function auditView(r: RemittanceRow) {
  return toDto(r);
}

function vnDateTime(d: Date | null): string {
  if (!d) return '';
  const v = new Date(d.getTime() + VN_OFFSET_MS).toISOString();
  return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11, 16)}`;
}

/** Ô CSV an toàn: bọc ngoặc kép, nhân đôi ngoặc kép, chặn công thức Excel (=, +, -, @). */
function csvCell(value: string | undefined): string {
  const v = value ?? '';
  const safe = /^[=+\-@]/.test(v) && !/^-?\d+$/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy bảng kê',
  });
}

function stateInvalid(status: InsuranceRemittanceStatus): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.INSURANCE_REMITTANCE_STATE_INVALID,
    message: `Bảng kê đang ở trạng thái "${status}" - không thực hiện được thao tác này`,
    details: { status },
  });
}
