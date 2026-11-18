import type { InsurancePartner, PremiumQuoteResult } from '@xeprime/prisma';
import {
  INSURANCE_PARTNER_QUOTE_MAX_RATIO,
  INSURANCE_PREMIUM_FALLBACK_REASON,
  INSURANCE_PREMIUM_SOURCE,
  partnerPremiumProblem,
  type VehicleProtectionTierQuote,
} from '@xeprime/types';
import type { InsuranceEligibilityService } from '../src/modules/insurance/insurance-eligibility.service';
import { InsurancePremiumQuoteService } from '../src/modules/insurance/insurance-premium-quote.service';

/**
 * ADR 0097 — phí bảo hiểm vật chất xe của từng hợp đồng hỏi đối tác lúc DUYỆT, công thức bậc là dự
 * phòng. Không cần DB: đối tác và dữ liệu xe là bản giả.
 */

const TIER: VehicleProtectionTierQuote = {
  amount: '112200',
  insuredValue: '340000000',
  maxDays: 5,
  percent: '0.033',
};
const TRIP = {
  vehicleId: 'veh1',
  pickupAt: new Date('2026-12-10T02:00:00Z'),
  returnAt: new Date('2026-12-12T11:00:00Z'),
};

function eligibility(vehicle: { manufactureYear: number | null; seatCount: number | null } | null) {
  return {
    eligibilityInput: async () =>
      vehicle
        ? {
            vehicleType: 'car',
            insuredValue: '340000000',
            brand: 'Toyota',
            model: 'Vios',
            imageTypes: [],
            registration: null,
            ...vehicle,
          }
        : null,
  } as unknown as InsuranceEligibilityService;
}

function partner(quote?: () => Promise<PremiumQuoteResult>): InsurancePartner {
  return {
    partnerName: 'Đối tác thử',
    configured: true,
    issue: () => Promise.reject(new Error('không dùng')),
    ...(quote ? { quotePremium: quote } : {}),
  };
}

const service = (
  quote?: () => Promise<PremiumQuoteResult>,
  vehicle: { manufactureYear: number | null; seatCount: number | null } | null = {
    manufactureYear: 2019,
    seatCount: 5,
  },
) => new InsurancePremiumQuoteService(partner(quote), eligibility(vehicle));

describe('InsurancePremiumQuoteService (ADR 0097)', () => {
  it('đối tác trả số hợp lệ ⇒ dùng số đối tác, giữ phí công thức để so', async () => {
    const r = await service(async () => ({ ok: true, amount: '118000' })).confirmForApproval(
      TIER,
      TRIP,
    );
    expect(r).toEqual({
      ...TIER,
      amount: '118000',
      formulaAmount: '112200',
      source: INSURANCE_PREMIUM_SOURCE.PARTNER,
    });
  });

  it('đối tác không trả lời trong thời gian chờ ⇒ công thức, lý do timeout, không chờ thêm', async () => {
    const never = () => new Promise<PremiumQuoteResult>(() => undefined);
    const started = Date.now();
    const answer = await service(never).ask(
      {
        insuredValue: '340000000',
        manufactureYear: 2019,
        seatCount: 5,
        from: TRIP.pickupAt,
        to: TRIP.returnAt,
        formulaAmount: '112200',
      },
      50,
    );
    expect(answer).toMatchObject({ ok: false, reason: INSURANCE_PREMIUM_FALLBACK_REASON.TIMEOUT });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('lượt duyệt chờ tối đa 1,5 giây', async () => {
    jest.useFakeTimers();
    try {
      const never = () => new Promise<PremiumQuoteResult>(() => undefined);
      const pending = service(never).confirmForApproval(TIER, TRIP);
      await jest.advanceTimersByTimeAsync(1499);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(2);
      expect(await pending).toMatchObject({
        amount: '112200',
        source: INSURANCE_PREMIUM_SOURCE.FORMULA,
        fallbackReason: INSURANCE_PREMIUM_FALLBACK_REASON.TIMEOUT,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('số đối tác lệch quá xa công thức ⇒ công thức, lý do out_of_range', async () => {
    const tooHigh = String(112200 * INSURANCE_PARTNER_QUOTE_MAX_RATIO + 1);
    const r = await service(async () => ({ ok: true, amount: tooHigh })).confirmForApproval(
      TIER,
      TRIP,
    );
    expect(r).toMatchObject({
      amount: '112200',
      source: INSURANCE_PREMIUM_SOURCE.FORMULA,
      fallbackReason: INSURANCE_PREMIUM_FALLBACK_REASON.OUT_OF_RANGE,
    });
  });

  it('đối tác báo lỗi / ném ⇒ công thức với lý do tương ứng, không bao giờ ném ra lượt duyệt', async () => {
    const rejected = await service(async () => ({
      ok: false,
      reason: 'rejected',
      message: '03 Chua khai bieu phi',
    })).confirmForApproval(TIER, TRIP);
    expect(rejected).toMatchObject({
      source: INSURANCE_PREMIUM_SOURCE.FORMULA,
      fallbackReason: INSURANCE_PREMIUM_FALLBACK_REASON.REJECTED,
    });
    const thrown = await service(() => Promise.reject(new Error('boom'))).confirmForApproval(
      TIER,
      TRIP,
    );
    expect(thrown).toMatchObject({
      source: INSURANCE_PREMIUM_SOURCE.FORMULA,
      fallbackReason: INSURANCE_PREMIUM_FALLBACK_REASON.UNAVAILABLE,
    });
  });

  it('adapter không có API tính phí ⇒ not_supported', async () => {
    const r = await service().confirmForApproval(TIER, TRIP);
    expect(r).toMatchObject({
      source: INSURANCE_PREMIUM_SOURCE.FORMULA,
      fallbackReason: INSURANCE_PREMIUM_FALLBACK_REASON.NOT_SUPPORTED,
    });
  });

  it('xe thiếu năm sản xuất / số chỗ ⇒ không gọi đối tác, dùng công thức', async () => {
    const quote = jest.fn(async (): Promise<PremiumQuoteResult> => ({ ok: true, amount: '1' }));
    const r = await service(quote, { manufactureYear: null, seatCount: 5 }).confirmForApproval(
      TIER,
      TRIP,
    );
    expect(quote).not.toHaveBeenCalled();
    expect(r.source).toBe(INSURANCE_PREMIUM_SOURCE.FORMULA);
  });

  it('partnerPremiumProblem: khoảng nhận [công thức ÷ N, công thức × N]', () => {
    expect(partnerPremiumProblem('112200', '112200')).toBeNull();
    expect(partnerPremiumProblem('224400', '112200')).toBeNull();
    expect(partnerPremiumProblem('56100', '112200')).toBeNull();
    expect(partnerPremiumProblem('224401', '112200')).toBe('out_of_range');
    expect(partnerPremiumProblem('56099', '112200')).toBe('out_of_range');
    expect(partnerPremiumProblem('0', '112200')).toBe('out_of_range');
    expect(partnerPremiumProblem('12.5', '112200')).toBe('out_of_range');
  });
});
