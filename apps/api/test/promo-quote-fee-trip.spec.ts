import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type {
  FeeTrip,
  PricingService,
  PromoQuoteContext,
} from '../src/modules/pricing/pricing.service';
import type { PromoCodeEvaluatorService } from '../src/modules/promo-codes/promo-code-evaluator.service';
import { PromoQuoteService } from '../src/modules/promo-codes/promo-quote.service';

/**
 * Áp mã khuyến mãi KHÔNG được làm mất bảo hiểm vật chất xe theo bậc (ADR 0088).
 *
 * Lỗi 11/11/2026: lượt tính lại có mã dựng một `FeeTrip` chỉ có loại xe + dịch vụ + bảng kê — thiếu
 * xe và lịch — nên máy giá coi chuyến "không mua được" `IV` theo bậc, và dòng "Bảo hiểm vật chất
 * xe" biến mất khỏi hộp đặt xe ngay khi khách áp mã. Spec khoá hợp đồng: lượt áp mã tính lại trên
 * ĐÚNG chuyến (và đúng câu trả lời cổng bảo hiểm) của lượt báo giá. Không cần DB.
 */
describe('Xem trước mã — tính lại trên đúng chuyến của báo giá', () => {
  it('truyền nguyên FeeTrip (xe + lịch) và cổng bảo hiểm của báo giá sang lượt áp mã', async () => {
    const feeTrip: FeeTrip = {
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      breakdown: { totalAmount: '720000', rows: [], days: 1, longTerm: null, dayAmounts: [] },
      vehicleId: 'VEHICLE',
      schedule: {
        pickupAt: new Date('2026-11-11T14:00:00Z'),
        returnAt: new Date('2026-11-12T14:00:00Z'),
      },
    };
    const insuranceOffered = { vehicleProtection: true, tripInsurance: false };
    const context = {
      tenantId: 'TENANT',
      quoteIsEstimate: false,
      insurance: { vehicleProtectionSelected: true, personalAccidentSelected: false },
      insuranceOffered,
      feeTrip,
      scope: { vehicleType: VEHICLE_TYPE.CAR, serviceType: SERVICE_TYPE.SELF_DRIVE, provinceCode: null },
      breakdown: {},
      fees: null,
      money: {
        eligibleAmount: '720000',
        grossOnlineAmount: '198430',
        sponsorableAmount: '158000',
        holdMinAmount: '0',
      },
    } as unknown as PromoQuoteContext;

    const applyPromoToFees = jest.fn().mockResolvedValue(null);
    const pricing = {
      promoContextFor: jest.fn().mockResolvedValue(context),
      applyPromoToFees,
    } as unknown as PricingService;
    const snapshot = { code: 'VAOTHU', discountApplied: '58000' };
    const evaluator = {
      evaluate: jest.fn().mockResolvedValue({
        applicable: true,
        clamped: false,
        snapshot,
        code: {
          code: 'VAOTHU',
          name: 'Voucher',
          description: null,
          discountType: 'fixed',
          discountPercent: null,
          maxDiscountAmount: null,
          minOrderAmount: { toFixed: () => '0' },
          endsAt: new Date(),
        },
      }),
    } as unknown as PromoCodeEvaluatorService;

    await new PromoQuoteService(pricing, evaluator).preview(
      { code: 'VAOTHU', vehicleId: 'VEHICLE' } as never,
      'CUSTOMER',
    );

    expect(applyPromoToFees).toHaveBeenCalledTimes(1);
    const [tenantId, trip, opts] = applyPromoToFees.mock.calls[0];
    expect(tenantId).toBe('TENANT');
    // CHÍNH object của báo giá — có xe và lịch, thứ bảo hiểm theo bậc cần.
    expect(trip).toBe(feeTrip);
    expect(opts).toMatchObject({
      quoteIsEstimate: false,
      promo: snapshot,
      vehicleProtectionSelected: true,
      personalAccidentSelected: false,
      insuranceOffered,
    });
  });
});
