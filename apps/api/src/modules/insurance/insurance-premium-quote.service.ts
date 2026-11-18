import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  INSURANCE_PARTNER_QUOTE_TIMEOUT_MS,
  INSURANCE_PREMIUM_FALLBACK_REASON,
  INSURANCE_PREMIUM_SOURCE,
  partnerPremiumProblem,
  type InsurancePremiumFallbackReason,
  type VehicleProtectionTierQuote,
} from '@xeprime/types';
import { InsuranceEligibilityService } from './insurance-eligibility.service';
import { InsuranceProductsService } from './insurance-products.service';
import {
  INSURANCE_PARTNER,
  type InsurancePartner,
  type PremiumQuoteRequest,
} from './partner/insurance-partner.port';

/** Kết quả một lượt hỏi phí đối tác — `ok: false` mang lý do đã chuẩn hoá. */
export type PartnerPremiumAnswer =
  | { ok: true; amount: string; elapsedMs: number }
  | {
      ok: false;
      reason: InsurancePremiumFallbackReason;
      message: string;
      elapsedMs: number;
    };

const TIMED_OUT = Symbol('timed-out');

/**
 * Phí hãng báo lúc duyệt lệch biểu phí bao nhiêu thì coi là hãng đã đổi giá (ADR 0106 điều 2): quá
 * 0,5% VÀ quá 1.000đ. % biểu phí giữ 4 chữ số lẻ nên số tính lại có thể lệch vài trăm đồng so với hãng
 * ở xe giá trị lớn — ngưỡng này để lệch làm tròn không báo động giả, còn đổi nhóm năm (~8%) hay đổi bậc
 * thì luôn vượt.
 */
const DRIFT_MIN_VND = 1000n;
const DRIFT_PERMILLE = 5n;

export function premiumDrifted(partnerAmount: string, formulaAmount: string): boolean {
  const partner = BigInt(partnerAmount);
  const formula = BigInt(formulaAmount);
  const diff = partner > formula ? partner - formula : formula - partner;
  return diff > DRIFT_MIN_VND && diff * 1000n > formula * DRIFT_PERMILLE;
}

const vnd = (amount: string) => `${new Intl.NumberFormat('vi-VN').format(BigInt(amount))}đ`;

/**
 * Phí bảo hiểm vật chất xe của từng hợp đồng lấy từ ĐỐI TÁC — ADR 0097.
 *
 * Chỉ lượt DUYỆT hỏi (một lần mỗi chuyến, chờ tối đa `INSURANCE_PARTNER_QUOTE_TIMEOUT_MS`): đó là
 * lúc số tiền giữ chỗ bị khoá. Báo giá công khai và ước tính trong hộp thư giữ công thức bậc — hỏi
 * đối tác ở mỗi lượt xem trang xe là đặt trang xe vào tay một API bị chặn IP.
 *
 * Đối tác không trả lời kịp / trả lỗi / trả số lệch quá xa công thức ⇒ dùng công thức, ghi lý do. Lượt
 * duyệt KHÔNG bao giờ hỏng vì đối tác: bảo hiểm là một dòng của báo giá, không phải cổng của nó.
 */
@Injectable()
export class InsurancePremiumQuoteService {
  private readonly logger = new Logger(InsurancePremiumQuoteService.name);

  constructor(
    @Inject(INSURANCE_PARTNER) private readonly partner: InsurancePartner,
    private readonly eligibility: InsuranceEligibilityService,
    private readonly products: InsuranceProductsService,
  ) {}

  /**
   * Chốt phí cho lượt duyệt: nhận báo giá theo công thức (`tier`), hỏi đối tác, trả lại báo giá mang
   * `source` + `formulaAmount` (+ `fallbackReason` khi dùng công thức).
   */
  async confirmForApproval(
    tier: VehicleProtectionTierQuote,
    trip: { vehicleId: string; pickupAt: Date; returnAt: Date },
  ): Promise<VehicleProtectionTierQuote> {
    const formulaAmount = tier.formulaAmount ?? tier.amount;
    const base: VehicleProtectionTierQuote = {
      amount: formulaAmount,
      insuredValue: tier.insuredValue,
      maxDays: tier.maxDays,
      percent: tier.percent,
      formulaAmount,
    };
    const vehicle = await this.eligibility.eligibilityInput(trip.vehicleId);
    const answer =
      vehicle?.manufactureYear && vehicle.seatCount
        ? await this.ask(
            {
              insuredValue: tier.insuredValue,
              manufactureYear: vehicle.manufactureYear,
              seatCount: vehicle.seatCount,
              from: trip.pickupAt,
              to: trip.returnAt,
              formulaAmount,
            },
            INSURANCE_PARTNER_QUOTE_TIMEOUT_MS,
          )
        : ({
            ok: false,
            reason: INSURANCE_PREMIUM_FALLBACK_REASON.REJECTED,
            message: 'Xe thiếu năm sản xuất hoặc số chỗ',
            elapsedMs: 0,
          } as const);

    if (answer.ok) {
      if (vehicle?.manufactureYear && premiumDrifted(answer.amount, formulaAmount)) {
        await this.reportDrift(
          `Lượt duyệt: xe đời ${vehicle.manufactureYear}, bậc tới ${tier.maxDays} ngày - biểu phí ${vnd(formulaAmount)}, ${this.partner.partnerName} báo ${vnd(answer.amount)}`,
        );
      }
      const problem = partnerPremiumProblem(answer.amount, formulaAmount);
      if (!problem) {
        return { ...base, amount: answer.amount, source: INSURANCE_PREMIUM_SOURCE.PARTNER };
      }
      this.logger.warn({
        msg: 'insurance: phí đối tác lệch quá xa công thức - dùng công thức',
        vehicleId: trip.vehicleId,
        partnerAmount: answer.amount,
        formulaAmount,
      });
      return {
        ...base,
        source: INSURANCE_PREMIUM_SOURCE.FORMULA,
        fallbackReason: problem,
      };
    }
    this.logger.warn({
      msg: 'insurance: không lấy được phí đối tác lúc duyệt - dùng công thức',
      vehicleId: trip.vehicleId,
      reason: answer.reason,
      detail: answer.message,
      elapsedMs: answer.elapsedMs,
    });
    return { ...base, source: INSURANCE_PREMIUM_SOURCE.FORMULA, fallbackReason: answer.reason };
  }

  /**
   * Hãng báo khác biểu phí ⇒ đánh dấu biểu phí lệch, nhắc admin đồng bộ lại (ADR 0106 điều 2). Không
   * bao giờ làm hỏng lượt duyệt: ghi không được thì chỉ log.
   */
  private async reportDrift(reason: string): Promise<void> {
    try {
      if (await this.products.markPremiumDrift(reason)) {
        this.logger.warn({ msg: 'insurance: phí hãng khác biểu phí - đánh dấu lệch', reason });
      }
    } catch (err) {
      this.logger.error({
        msg: 'insurance: không ghi được đánh dấu lệch biểu phí',
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Hỏi đối tác một lần, chặn tổng thời gian ở `timeoutMs` (gồm cả lượt lấy token nếu token hết hạn —
   * lượt đó chạy tiếp ngầm và token vẫn được cache cho lần sau). Không bao giờ ném.
   */
  async ask(
    request: Omit<PremiumQuoteRequest, 'timeoutMs'>,
    timeoutMs: number,
  ): Promise<PartnerPremiumAnswer> {
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    if (!this.partner.quotePremium) {
      return {
        ok: false,
        reason: INSURANCE_PREMIUM_FALLBACK_REASON.NOT_SUPPORTED,
        message: 'Đối tác không có API tính phí',
        elapsedMs: 0,
      };
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        this.partner.quotePremium({ ...request, timeoutMs }),
        new Promise<typeof TIMED_OUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
        }),
      ]);
      if (result === TIMED_OUT) {
        return {
          ok: false,
          reason: INSURANCE_PREMIUM_FALLBACK_REASON.TIMEOUT,
          message: `Đối tác không trả lời trong ${timeoutMs}ms`,
          elapsedMs: elapsed(),
        };
      }
      if (result.ok) return { ok: true, amount: result.amount, elapsedMs: elapsed() };
      return {
        ok: false,
        reason:
          result.reason === 'rejected'
            ? INSURANCE_PREMIUM_FALLBACK_REASON.REJECTED
            : INSURANCE_PREMIUM_FALLBACK_REASON.UNAVAILABLE,
        message: result.message,
        elapsedMs: elapsed(),
      };
    } catch (err) {
      return {
        ok: false,
        reason: INSURANCE_PREMIUM_FALLBACK_REASON.UNAVAILABLE,
        message: err instanceof Error ? err.name : 'unknown',
        elapsedMs: elapsed(),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
