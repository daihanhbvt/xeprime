import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_HOLD_OUTCOME,
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_VOID_BRANCH,
  INSURANCE_VOID_REFUND_TIMING,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  resolveRefundWalletOwner,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletService } from '../wallet/wallet.service';
import type { VoidInsurancePolicyResultDto } from './dto/insurance.dto';
import { insuranceVoidPlan } from './insurance-void-plan';
import { InsuranceService } from './insurance.service';

/** Hợp đồng còn chờ cấp — phí khách đã trả mà chưa có GCN. */
const AWAITING_ISSUE = [INSURANCE_POLICY_STATUS.RESERVED, INSURANCE_POLICY_STATUS.FAILED];

export interface InsuranceRefundSweepResult {
  /** Tra cứu lần cuối thấy đối tác ĐÃ cấp — ghi nhận như cấp bình thường. */
  recovered: number;
  /** Không có hợp đồng ⇒ huỷ và hoàn vào Ví điểm khách. */
  refunded: number;
  /** Đối tác đang lỗi — để vòng sau, không hoàn trên một câu trả lời chưa chắc. */
  deferred: number;
}

/** Hợp đồng ĐÃ HUỶ bởi admin (ADR 0093) mà chưa hoàn vì lúc đó hold còn mở — nay hold đã chốt. */
const CANCELLED_REFUND_DUE: Prisma.BookingInsurancePolicyWhereInput = {
  status: INSURANCE_POLICY_STATUS.CANCELLED,
  refundedAt: null,
  // Chỉ hợp đồng do lượt THU HỒI huỷ: huỷ chuyến trước bàn giao cũng ra `cancelled` nhưng phí của nó
  // đã về khách qua chính hold (kết cục hoàn), không bao giờ qua đây.
  voidReason: { not: null },
  hold: { outcome: BOOKING_HOLD_OUTCOME.SETTLED, customerUserId: { not: null } },
};

const POLICY_FOR_REFUND = {
  id: true,
  tenantId: true,
  bookingId: true,
  holdId: true,
  status: true,
  coverageFrom: true,
  issuedAt: true,
  remittanceId: true,
  premiumAmount: true,
  serviceFeeAmount: true,
  hold: { select: { outcome: true, customerUserId: true } },
} satisfies Prisma.BookingInsurancePolicySelect;

type PolicyForRefund = Prisma.BookingInsurancePolicyGetPayload<{
  select: typeof POLICY_FOR_REFUND;
}>;

/**
 * HOÀN phí bảo hiểm vào Ví điểm khách — ADR 0091 điều 7 (tự hoàn khi quá giờ trả mà chưa cấp được) và
 * ADR 0093 (admin thu hồi hợp đồng chưa từng có hiệu lực). Một đường ghi có cho cả hai: bút toán
 * `insurance_refund`, nguồn = hợp đồng (unique của sổ ví chống ghi đôi), `refunded_at` trên hợp đồng.
 *
 * Tiền chỉ hoàn khi khoản giữ chỗ đã chốt `settled`: lúc đó phí đã nằm ở "phải trả hãng" qua chính hợp
 * đồng. Hoàn trước quyết toán thì lượt quyết toán sau đó sẽ phân bổ lại đúng khoản đã trả.
 */
@Injectable()
export class InsuranceRefundService {
  private readonly logger = new Logger(InsuranceRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly insurance: InsuranceService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Vòng quét (5 phút, `InsuranceFollowUpSweeper`):
   *  1. hợp đồng `reserved`/`failed` của chuyến đã giao xe, quá giờ trả, hold đã chốt ⇒ tra cứu lần
   *     cuối rồi huỷ + hoàn (ADR 0091 điều 7);
   *  2. hợp đồng admin đã huỷ khi hold còn mở, nay hold đã chốt `settled` ⇒ hoàn (ADR 0093).
   */
  async refundOverdue(now: Date = new Date(), limit = 20): Promise<InsuranceRefundSweepResult> {
    const result: InsuranceRefundSweepResult = { recovered: 0, refunded: 0, deferred: 0 };
    const due = await this.prisma.bookingInsurancePolicy.findMany({
      where: {
        status: { in: AWAITING_ISSUE },
        holdId: { not: null },
        hold: {
          outcome: BOOKING_HOLD_OUTCOME.SETTLED,
          customerUserId: { not: null },
        },
        booking: { returnAt: { lt: now }, actualPickupAt: { not: null } },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, status: true },
    });
    for (const row of due) {
      const outcome = await this.finalCheck(row.id, row.status, now);
      if (outcome === 'issued') result.recovered += 1;
      else if (outcome === 'deferred') result.deferred += 1;
      else if (outcome === 'refund' && (await this.refundFailed(row.id, now))) result.refunded += 1;
    }

    const cancelledDue = await this.prisma.bookingInsurancePolicy.findMany({
      where: CANCELLED_REFUND_DUE,
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const row of cancelledDue) {
      if (await this.refundCancelled(row.id, now)) result.refunded += 1;
    }
    return result;
  }

  /**
   * THU HỒI một hợp đồng — ADR 0093. Nhánh do `insuranceVoidPlan` quyết theo hiệu lực:
   *  - đã có hiệu lực ⇒ `voided`, không hoàn, phí vẫn kê trả hãng; bắt buộc mã đối chiếu bên đối tác;
   *  - chưa từng có hiệu lực ⇒ `cancelled`, hoàn `phí + phí thu hộ` vào Ví điểm khách ngay khi hold đã
   *    chốt `settled` (cùng transaction), hoặc để vòng quét hoàn sau khi hold chốt.
   * Không gọi đối tác (MIC chưa có API huỷ) — đây là ghi nhận kèm bằng chứng đối chiếu.
   */
  async voidPolicy(
    policyId: string,
    actorUserId: string,
    input: { reason: string; partnerReference?: string | null },
    now: Date = new Date(),
  ): Promise<VoidInsurancePolicyResultDto> {
    const reason = input.reason.trim();
    const partnerReference = input.partnerReference?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.bookingInsurancePolicy.findUnique({
        where: { id: policyId },
        select: POLICY_FOR_REFUND,
      });
      if (!policy) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy hợp đồng bảo hiểm',
        });
      }
      const plan = insuranceVoidPlan(policy, now);
      if (!plan) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: 'Chỉ hợp đồng đã cấp hoặc đang lỗi mới thu hồi được',
          details: { status: policy.status },
        });
      }
      if (plan.partnerReferenceRequired && !partnerReference) {
        throw new BadRequestException({
          code: API_ERROR_CODE.INSURANCE_VOID_REFERENCE_REQUIRED,
          message: 'Hợp đồng đã có bên hãng - nhập mã huỷ hoặc biên bản đối chiếu',
        });
      }
      if (plan.blockedByRemittance) {
        throw new ConflictException({
          code: API_ERROR_CODE.INSURANCE_POLICY_REMITTED,
          message: 'Hợp đồng đã nằm trong bảng kê trả hãng - đối chiếu với hãng trước',
        });
      }

      const keepPayable = plan.branch === INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE;
      // Trạng thái trong WHERE là phần CHIẾM: worker đang thử cấp lại hay một người trực khác bấm
      // cùng lúc thì chỉ một lượt khớp.
      const { count } = await tx.bookingInsurancePolicy.updateMany({
        where: { id: policyId, status: policy.status },
        data: keepPayable
          ? {
              status: INSURANCE_POLICY_STATUS.VOIDED,
              voidedAt: now,
              nextAttemptAt: null,
              voidReason: reason,
              voidPartnerReference: partnerReference,
            }
          : {
              status: INSURANCE_POLICY_STATUS.CANCELLED,
              cancelledAt: now,
              nextAttemptAt: null,
              voidReason: reason,
              voidPartnerReference: partnerReference,
            },
      });
      if (count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: 'Hợp đồng vừa đổi trạng thái - tải lại để xem',
        });
      }

      let refunded: Prisma.Decimal | null = null;
      if (plan.refundTiming === INSURANCE_VOID_REFUND_TIMING.NOW) {
        refunded = await this.creditRefundWithinTx(
          tx,
          policy,
          now,
          'Hoàn phí bảo hiểm - hợp đồng bị thu hồi trước khi có hiệu lực',
        );
      }

      await this.audit.record(
        {
          tenantId: policy.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: keepPayable ? 'insurance_policy.void' : 'insurance_policy.cancel_refund',
          targetType: 'booking_insurance_policy',
          targetId: policyId,
          before: { status: policy.status },
          after: {
            status: keepPayable
              ? INSURANCE_POLICY_STATUS.VOIDED
              : INSURANCE_POLICY_STATUS.CANCELLED,
            reason,
            partnerReference,
            refundTiming: plan.refundTiming,
            refundedAmount: refunded?.toFixed(0) ?? null,
          },
        },
        tx,
      );

      return {
        branch: plan.branch,
        status: keepPayable ? INSURANCE_POLICY_STATUS.VOIDED : INSURANCE_POLICY_STATUS.CANCELLED,
        refundTiming: plan.refundTiming,
        refundedAmount: refunded?.toFixed(0) ?? null,
      };
    });
  }

  /**
   * Tra cứu lần cuối. Chiếm hợp đồng bằng một `UPDATE` có điều kiện (cùng khuôn với worker) rồi đi qua
   * đúng đường cấp đơn — adapter MIC tra `id_tras` trước, nên hợp đồng đã cấp mà lượt trước mất phản
   * hồi sẽ được ghi nhận thay vì bị hoàn nhầm.
   */
  private async finalCheck(
    policyId: string,
    status: string,
    now: Date,
  ): Promise<'issued' | 'refund' | 'deferred' | 'skipped'> {
    const { count } = await this.prisma.bookingInsurancePolicy.updateMany({
      where: { id: policyId, status },
      data: { status: INSURANCE_POLICY_STATUS.ISSUING, lastAttemptAt: now },
    });
    if (count === 0) return 'skipped';
    if ((await this.insurance.issueOne(policyId, now)) === 'issued') return 'issued';
    const after = await this.prisma.bookingInsurancePolicy.findUnique({
      where: { id: policyId },
      select: { lastErrorCode: true },
    });
    return after?.lastErrorCode === INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE
      ? 'deferred'
      : 'refund';
  }

  /** ADR 0091 điều 7: hợp đồng `failed` sau lượt tra cuối ⇒ huỷ + hoàn trong MỘT transaction. */
  private async refundFailed(policyId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.bookingInsurancePolicy.findUnique({
        where: { id: policyId },
        select: POLICY_FOR_REFUND,
      });
      if (!policy?.hold?.customerUserId) return false;
      // Trạng thái trong WHERE là phần CHIẾM: lượt song song (hai tiến trình API) chỉ một bên khớp.
      const { count } = await tx.bookingInsurancePolicy.updateMany({
        where: { id: policyId, status: INSURANCE_POLICY_STATUS.FAILED },
        data: {
          status: INSURANCE_POLICY_STATUS.CANCELLED,
          cancelledAt: now,
          nextAttemptAt: null,
        },
      });
      if (count === 0) return false;
      await this.creditRefundWithinTx(
        tx,
        policy,
        now,
        'Hoàn phí bảo hiểm - hợp đồng không cấp được trước giờ trả xe',
      );
      return true;
    });
  }

  /** ADR 0093: hợp đồng admin đã huỷ khi hold còn mở, nay hold đã chốt `settled` ⇒ hoàn. */
  private async refundCancelled(policyId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.bookingInsurancePolicy.findFirst({
        where: { id: policyId, ...CANCELLED_REFUND_DUE },
        select: POLICY_FOR_REFUND,
      });
      if (!policy) return false;
      return (
        (await this.creditRefundWithinTx(
          tx,
          policy,
          now,
          'Hoàn phí bảo hiểm - hợp đồng bị thu hồi trước khi có hiệu lực',
        )) != null
      );
    });
  }

  /**
   * Ghi có `phí + phí thu hộ` của hợp đồng vào Ví điểm TÀI KHOẢN KHÁCH và đóng dấu `refunded_at`.
   *
   * Chiếm bằng `refunded_at IS NULL` trong WHERE; khoá cuối là unique của sổ ví theo (loại, nguồn) —
   * chạy lại không bao giờ hoàn đôi. `null` = đã có lượt khác hoàn trước, hoặc không có ví để hoàn.
   */
  private async creditRefundWithinTx(
    tx: Prisma.TransactionClient,
    policy: PolicyForRefund,
    now: Date,
    note: string,
  ): Promise<Prisma.Decimal | null> {
    const customerUserId = policy.hold?.customerUserId;
    if (!customerUserId) return null;
    const { count } = await tx.bookingInsurancePolicy.updateMany({
      where: { id: policy.id, status: INSURANCE_POLICY_STATUS.CANCELLED, refundedAt: null },
      data: { refundedAt: now },
    });
    if (count === 0) return null;
    const amount = new Prisma.Decimal(policy.premiumAmount).add(policy.serviceFeeAmount);
    await this.wallet.creditWithinTx(tx, {
      owner: resolveRefundWalletOwner(customerUserId),
      kind: WALLET_ENTRY_KIND.INSURANCE_REFUND,
      sourceType: WALLET_ENTRY_SOURCE.BOOKING_INSURANCE_POLICY,
      sourceRefId: policy.id,
      amount,
      bookingId: policy.bookingId,
      holdId: policy.holdId,
      note,
    });
    this.logger.warn(
      `Bảo hiểm: hoàn ${amount.toFixed(0)}đ vào Ví điểm khách - hợp đồng ${policy.id}`,
    );
    return amount;
  }
}
