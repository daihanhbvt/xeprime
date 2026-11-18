import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  INSURANCE_ELIGIBILITY_VEHICLE_SELECT,
  insuranceEligibilityInputOf,
  Prisma,
  resolveInsuranceMode,
} from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PREMIUM_FALLBACK_REASON_VALUES,
  INSURANCE_PREMIUM_SOURCE,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_VEHICLE_ELIGIBILITY_FILTER,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_TYPE,
  computeValueTierPremium,
  insuranceEligibilityGaps,
  insuranceRemittanceCommission,
  partnerPremiumProblem,
  readInsurancePremiumTiers,
  requiredVehicleImageTypes,
  percentOfVnd,
  type InsurancePremiumFallbackReason,
  type InsurancePremiumTier,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  INSURANCE_VEHICLE_DEFAULT_LIMIT,
  INSURANCE_VEHICLE_MAX_LIMIT,
  type InsuranceOverviewDto,
  type InsurancePremiumCheckDto,
  type InsurancePremiumCheckResultDto,
  type InsuranceTierPremiumDto,
  type InsuranceVehicleListQueryDto,
  type InsuranceVehiclePageDto,
} from './dto/insurance-insights.dto';
import { InsuranceFollowUpService } from './insurance-follow-up.service';
import { InsurancePremiumQuoteService } from './insurance-premium-quote.service';
import { periodOf } from './insurance-remittance.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';

/** Hợp đồng PHẢI TRẢ hãng — cùng tập với bảng kê (`InsuranceRemittanceService`). */
const PAYABLE_STATUSES = [
  INSURANCE_POLICY_STATUS.ISSUED,
  INSURANCE_POLICY_STATUS.CLAIM,
  INSURANCE_POLICY_STATUS.VOIDED,
];

/**
 * Màn đối chiếu chờ được lâu hơn lượt duyệt: admin đang ngồi nhìn kết quả, không có khách nào đợi.
 * Vẫn chặn để một hãng treo không giữ request mãi.
 */
const PREMIUM_CHECK_TIMEOUT_MS = 8_000;
const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

type VehicleTripProduct = {
  tiers: InsurancePremiumTier[];
  serviceFeePercent: number | null;
  agencyCommissionPercent: Prisma.Decimal;
};

/**
 * Số liệu quản trị bảo hiểm — ADR 0097. CHỈ ĐỌC (và hỏi phí hãng ở màn đối chiếu); không ghi bảng
 * nào, nên không có writer nào bị chia sẻ.
 *
 *  - Tổng quan tháng: phí thu khách, phải trả hãng, hoa hồng đại lý, phí thu hộ, chênh lệch, nguồn phí;
 *  - Danh sách ô tô: giá trị xe, chế độ chủ xe, điều kiện, phí theo từng bậc;
 *  - Đối chiếu: hỏi hãng phí của từng bậc cho một xe / một bộ giá trị, so với bảng.
 */
@Injectable()
export class InsuranceInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followUp: InsuranceFollowUpService,
    private readonly quotes: InsurancePremiumQuoteService,
    @Inject(INSURANCE_PARTNER) private readonly partner: InsurancePartner,
  ) {}

  // ── Tổng quan ───────────────────────────────────────────────────────────────

  async overview(month: string): Promise<InsuranceOverviewDto> {
    const { periodMonth, periodEnd } = periodOf(month);
    // `periodMonth` là ngày đầu tháng (UTC) — mốc 00:00 giờ Việt Nam của ngày đó.
    const start = new Date(periodMonth.getTime() - VN_OFFSET_MS);
    const statuses = Prisma.join(PAYABLE_STATUSES);

    const [issuedRows, sourceRows, refundRows, failed, attention, unremittedRows, product] =
      await Promise.all([
        this.prisma.$queryRaw<
          Array<{
            count: bigint;
            test_count: bigint;
            missing_partner: bigint;
            collected: Prisma.Decimal | null;
            payable: Prisma.Decimal | null;
            service_fee: Prisma.Decimal | null;
          }>
        >`
          SELECT COUNT(*) AS count,
                 COUNT(*) FILTER (WHERE is_test) AS test_count,
                 COUNT(*) FILTER (WHERE partner_premium_amount IS NULL) AS missing_partner,
                 SUM(premium_amount) AS collected,
                 SUM(COALESCE(partner_premium_amount, premium_amount)) AS payable,
                 SUM(service_fee_amount) AS service_fee
            FROM booking_insurance_policies
           WHERE status IN (${statuses})
             AND issued_at >= ${start} AND issued_at < ${periodEnd}`,
        this.prisma.$queryRaw<
          Array<{ source: string | null; reason: string | null; count: bigint }>
        >`
          SELECT premium_source AS source, premium_quote_fallback_reason AS reason, COUNT(*) AS count
            FROM booking_insurance_policies
           WHERE product_kind = ${INSURANCE_PRODUCT_KIND.VEHICLE_TRIP}
             AND created_at >= ${start} AND created_at < ${periodEnd}
           GROUP BY 1, 2`,
        this.prisma.$queryRaw<Array<{ count: bigint; amount: Prisma.Decimal | null }>>`
          SELECT COUNT(*) AS count, SUM(premium_amount + service_fee_amount) AS amount
            FROM booking_insurance_policies
           WHERE refunded_at >= ${start} AND refunded_at < ${periodEnd}`,
        this.prisma.bookingInsurancePolicy.count({
          where: { status: INSURANCE_POLICY_STATUS.FAILED },
        }),
        this.followUp.attentionCount(),
        this.prisma.$queryRaw<Array<{ count: bigint; gross: Prisma.Decimal | null }>>`
          SELECT COUNT(*) AS count, SUM(COALESCE(partner_premium_amount, premium_amount)) AS gross
            FROM booking_insurance_policies
           WHERE status IN (${statuses})
             AND remittance_id IS NULL
             AND issued_at IS NOT NULL`,
        this.vehicleTripProduct(),
      ]);

    const issued = issuedRows[0];
    const collected = dec(issued?.collected);
    const payable = dec(issued?.payable);
    const serviceFee = dec(issued?.service_fee);
    const commissionPercent = product?.agencyCommissionPercent ?? new Prisma.Decimal(0);
    const commission = new Prisma.Decimal(
      insuranceRemittanceCommission(payable.toFixed(0), commissionPercent.toFixed(2)),
    );
    const difference = collected.minus(payable);

    let partner = 0;
    let formula = 0;
    let unrecorded = 0;
    const fallbacks = new Map<InsurancePremiumFallbackReason, number>();
    for (const row of sourceRows) {
      const n = Number(row.count);
      if (row.source === INSURANCE_PREMIUM_SOURCE.PARTNER) partner += n;
      else if (row.source === INSURANCE_PREMIUM_SOURCE.FORMULA) {
        formula += n;
        const reason = INSURANCE_PREMIUM_FALLBACK_REASON_VALUES.find((r) => r === row.reason);
        if (reason) fallbacks.set(reason, (fallbacks.get(reason) ?? 0) + n);
      } else unrecorded += n;
    }

    return {
      month,
      issued: {
        count: Number(issued?.count ?? 0),
        testCount: Number(issued?.test_count ?? 0),
        collectedPremium: collected.toFixed(0),
        payablePremium: payable.toFixed(0),
        partnerPremiumMissingCount: Number(issued?.missing_partner ?? 0),
        premiumDifference: difference.toFixed(0),
        serviceFee: serviceFee.toFixed(0),
        agencyCommissionPercent: commissionPercent.toFixed(2),
        agencyCommission: commission.toFixed(0),
        netPayable: payable.minus(commission).toFixed(0),
        platformEarnings: serviceFee.plus(commission).plus(difference).toFixed(0),
      },
      sources: {
        partner,
        formula,
        unrecorded,
        fallbacks: [...fallbacks.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => ({ reason, count })),
      },
      refunds: {
        count: Number(refundRows[0]?.count ?? 0),
        amount: dec(refundRows[0]?.amount).toFixed(0),
      },
      backlog: {
        failed,
        attention,
        unremittedCount: Number(unremittedRows[0]?.count ?? 0),
        unremittedPremium: dec(unremittedRows[0]?.gross).toFixed(0),
      },
    };
  }

  // ── Danh sách ô tô ──────────────────────────────────────────────────────────

  async vehicles(query: InsuranceVehicleListQueryDto): Promise<InsuranceVehiclePageDto> {
    const paging = resolvePaging(
      query,
      INSURANCE_VEHICLE_DEFAULT_LIMIT,
      INSURANCE_VEHICLE_MAX_LIMIT,
    );
    const and: Prisma.VehicleWhereInput[] = [{ vehicleType: VEHICLE_TYPE.CAR, deletedAt: null }];
    if (query.q) {
      const q = query.q;
      and.push({
        OR: [
          { plateNumber: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { tenant: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.eligibility === INSURANCE_VEHICLE_ELIGIBILITY_FILTER.ELIGIBLE)
      and.push(eligibleWhere());
    if (query.eligibility === INSURANCE_VEHICLE_ELIGIBILITY_FILTER.MISSING) {
      and.push({ NOT: eligibleWhere() });
    }
    const where: Prisma.VehicleWhereInput = { AND: and };

    const [rows, total, product] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.limit,
        select: {
          ...INSURANCE_ELIGIBILITY_VEHICLE_SELECT,
          id: true,
          name: true,
          plateNumber: true,
          tenantId: true,
          tenant: { select: { name: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
      this.vehicleTripProduct(),
    ]);

    // Chế độ Bắt buộc/Tuỳ chọn — một câu cho cả trang, cùng thứ tự ưu tiên với báo giá.
    const policies = rows.length
      ? await this.prisma.rentalPolicy.findMany({
          where: {
            tenantId: { in: [...new Set(rows.map((r) => r.tenantId))] },
            OR: [{ vehicleId: { in: rows.map((r) => r.id) } }, { vehicleId: null }],
          },
          select: { tenantId: true, vehicleId: true, vehicleType: true, insuranceMode: true },
        })
      : [];

    return {
      data: rows.map((row) => {
        const own = policies.filter((p) => p.tenantId === row.tenantId);
        const gaps = insuranceEligibilityGaps(insuranceEligibilityInputOf(row));
        const insuredValue = row.insuredValue ? row.insuredValue.toFixed(0) : null;
        return {
          vehicleId: row.id,
          vehicleName: row.name,
          plateNumber: row.plateNumber,
          tenantId: row.tenantId,
          tenantName: row.tenant.name,
          insuredValue,
          manufactureYear: row.manufactureYear,
          seatCount: row.seatCount,
          insuranceMode: resolveInsuranceMode({
            override: own.find((p) => p.vehicleId === row.id)?.insuranceMode,
            typedDefault: own.find((p) => p.vehicleId === null && p.vehicleType === row.vehicleType)
              ?.insuranceMode,
            legacyDefault: own.find((p) => p.vehicleId === null && p.vehicleType === null)
              ?.insuranceMode,
          }),
          eligible: gaps.length === 0,
          gaps,
          tiers: insuredValue && product ? tierPremiums(insuredValue, product) : [],
        };
      }),
      meta: paginationMeta(paging, total),
    };
  }

  // ── Đối chiếu với hãng ──────────────────────────────────────────────────────

  async premiumCheck(dto: InsurancePremiumCheckDto): Promise<InsurancePremiumCheckResultDto> {
    const product = await this.vehicleTripProduct();
    if (!product) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Sản phẩm bảo hiểm vật chất xe chưa có biểu phí bậc',
      });
    }
    const input = await this.checkInput(dto);
    const from = nextVnMorning();
    const rows = await Promise.all(
      product.tiers.map(async (tier) => {
        // Giữa bậc này và bậc trước: thời lượng tối đa của bậc trừ 1 giờ — chắc chắn rơi đúng bậc.
        const sampleHours = tier.maxDays * 24 - 1;
        const formulaPremium = computeValueTierPremium(input.insuredValue, tier.percent);
        const answer = await this.quotes.ask(
          {
            insuredValue: input.insuredValue,
            manufactureYear: input.manufactureYear,
            seatCount: input.seatCount,
            from,
            to: new Date(from.getTime() + sampleHours * HOUR_MS),
            formulaAmount: formulaPremium,
          },
          PREMIUM_CHECK_TIMEOUT_MS,
        );
        const partnerPremium = answer.ok ? answer.amount : null;
        return {
          maxDays: tier.maxDays,
          percent: tier.percent,
          sampleHours,
          formulaPremium,
          partnerPremium,
          difference: partnerPremium
            ? (BigInt(partnerPremium) - BigInt(formulaPremium)).toString()
            : null,
          problem: answer.ok ? partnerPremiumProblem(answer.amount, formulaPremium) : answer.reason,
          partnerMessage: answer.ok ? null : answer.message,
          elapsedMs: answer.elapsedMs,
        };
      }),
    );
    return { ...input, partnerName: this.partner.partnerName, rows };
  }

  // ── Nội bộ ──────────────────────────────────────────────────────────────────

  /**
   * Sản phẩm vật chất xe theo bậc — đọc thẳng danh mục, KHÔNG qua cổng chào bán: admin cần thấy
   * biểu phí kể cả khi môi trường chưa cắm đối tác.
   */
  private async vehicleTripProduct(): Promise<VehicleTripProduct | null> {
    const row = await this.prisma.insuranceProduct.findFirst({
      where: {
        kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
        premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
      },
      orderBy: [{ isActive: 'desc' }, { displayOrder: 'asc' }],
      select: {
        premiumTiersJson: true,
        serviceFeeEnabled: true,
        serviceFeePercent: true,
        agencyCommissionPercent: true,
      },
    });
    const tiers = row ? readInsurancePremiumTiers(row.premiumTiersJson) : null;
    if (!row || !tiers) return null;
    const percent = Number(row.serviceFeePercent);
    return {
      tiers,
      serviceFeePercent: row.serviceFeeEnabled && percent > 0 ? percent : null,
      agencyCommissionPercent: row.agencyCommissionPercent,
    };
  }

  private async checkInput(
    dto: InsurancePremiumCheckDto,
  ): Promise<{ insuredValue: string; manufactureYear: number; seatCount: number }> {
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, deletedAt: null },
        select: { insuredValue: true, manufactureYear: true, seatCount: true },
      });
      if (!vehicle) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy xe',
        });
      }
      if (!vehicle.insuredValue || !vehicle.manufactureYear || !vehicle.seatCount) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Xe chưa có đủ giá trị xe, năm sản xuất và số chỗ',
        });
      }
      return {
        insuredValue: vehicle.insuredValue.toFixed(0),
        manufactureYear: vehicle.manufactureYear,
        seatCount: vehicle.seatCount,
      };
    }
    if (
      !dto.insuredValue ||
      !dto.manufactureYear ||
      !dto.seatCount ||
      !(Number(dto.insuredValue) > 0)
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chọn một xe, hoặc nhập giá trị xe, năm sản xuất và số chỗ',
      });
    }
    return {
      insuredValue: String(BigInt(dto.insuredValue)),
      manufactureYear: dto.manufactureYear,
      seatCount: dto.seatCount,
    };
  }
}

function dec(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

/** Phí từng bậc của một giá trị xe — công thức hệ thống, kèm phí thu hộ nếu đang bật. */
function tierPremiums(
  insuredValue: string,
  product: VehicleTripProduct,
): InsuranceTierPremiumDto[] {
  return product.tiers.map((tier) => {
    const premium = computeValueTierPremium(insuredValue, tier.percent);
    return {
      maxDays: tier.maxDays,
      percent: tier.percent,
      premium,
      // Cùng hàm với dòng phí thu hộ của bảng phí khách (`computeCustomerFees`).
      serviceFee: product.serviceFeePercent
        ? String(percentOfVnd(Number(premium), product.serviceFeePercent))
        : '0',
    };
  });
}

/**
 * Xe ĐỦ điều kiện bảo hiểm, viết bằng điều kiện Prisma để lọc và phân trang ở DB. Cùng các vế với
 * `insuranceEligibilityGaps`; khác duy nhất ở cà vẹt: ở đây "có MỘT cà vẹt còn hiệu lực đủ trường",
 * hàm thuần xét cà vẹt MỚI NHẤT. Cột `gaps` của từng dòng vẫn đến từ hàm thuần.
 */
function eligibleWhere(): Prisma.VehicleWhereInput {
  return {
    AND: [
      { insuredValue: { gt: 0 } },
      { brand: { not: null } },
      { brand: { not: '' } },
      { model: { not: null } },
      { model: { not: '' } },
      { manufactureYear: { not: null } },
      { seatCount: { not: null } },
      {
        documents: {
          some: {
            type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
            archivedAt: null,
            chassisNumber: { not: null },
            holderName: { not: null },
          },
        },
      },
      ...requiredVehicleImageTypes(VEHICLE_TYPE.CAR).map((imageType) => ({
        images: { some: { imageType } },
      })),
    ],
  };
}

/** 09:00 sáng mai giờ Việt Nam — mốc mẫu khi hỏi hãng (hãng đòi giờ bắt đầu ở tương lai). */
function nextVnMorning(now: Date = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const day = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1, 9);
  return new Date(day - VN_OFFSET_MS);
}
