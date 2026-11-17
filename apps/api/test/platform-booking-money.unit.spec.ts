import {
  BILLING_MODE,
  PROMO_AUDIENCE,
  PROMO_DISCOUNT_TYPE,
  PROMO_VEHICLE_SCOPE,
  SELLER_ENTITY_TYPE,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  computeCustomerFees,
  type CustomerFeeBreakdown,
  type PromoCodeSnapshot,
} from '@xeprime/types';
import { ownerPayoutOf } from '../src/common/owner-payout';
import { marketplaceFeesOf } from '../src/modules/platform-admin/platform-booking-money';
import { FEE_POLICY_ND117 } from './helpers/fee-snapshot';

/**
 * Bảng tiền marketplace của chi tiết đơn phía NỀN TẢNG (đợt rà Admin 16/11/2026) - hàm thuần trên
 * bảng phí đã đóng băng. Mỗi dòng phải là đúng con số của snapshot (không tính lại), và các dòng
 * phải cộng khớp nhau tới ĐỒNG - đó là thứ người trực đọc để trả lời "khách trả bao nhiêu, chủ xe
 * nhận bao nhiêu".
 */
const PERIOD = {
  pickupAt: new Date('2026-11-20T02:00:00Z'),
  returnAt: new Date('2026-11-22T02:00:00Z'),
};

const n = (v: string) => Number(v);

/** Các đẳng thức của bảng tiền - đúng ở MỌI tuyến, có hay không có mã. */
function expectBalanced(fees: CustomerFeeBreakdown) {
  const m = marketplaceFeesOf(fees, PERIOD);
  if (!m) throw new Error('bảng phí v2 phải dựng được bảng tiền');

  // Tiền giữ chỗ trước mã = D + S + H + IV + IP + phí thu hộ.
  expect(n(m.grossOnlineAmount)).toBe(
    n(m.depositAmount) +
      n(m.serviceFeeAmount) +
      n(m.ownerPayout.ownerCommissionAmount) +
      n(m.vehicleInsuranceAmount) +
      n(m.personalInsuranceAmount) +
      n(m.insuranceServiceFeeAmount),
  );
  // Khách chuyển = trước mã − P; khách trả cả chuyến (đã trừ mã) = chuyển online + trả tay.
  expect(n(m.onlineAmount)).toBe(n(m.grossOnlineAmount) - n(m.promoDiscountAmount));
  expect(n(m.customerTotalAmount)).toBe(n(m.onlineAmount) + n(m.payAtPickupAmount));
  // Nền tảng giữ S + H; doanh thu thật trừ tài trợ.
  expect(n(m.platformRetainedAmount)).toBe(
    n(m.serviceFeeAmount) + n(m.ownerPayout.ownerCommissionAmount),
  );
  expect(n(m.platformNetAmount)).toBe(n(m.platformRetainedAmount) - n(m.promoDiscountAmount));
  // Phía chủ xe là ĐÚNG bảng cộng ví của site đối tác, và cộng ví = D − T.
  expect(m.ownerPayout).toEqual(ownerPayoutOf(fees, undefined, PERIOD));
  expect(n(m.ownerPayout.ownerPayableAmount)).toBe(n(m.depositAmount) - n(m.ownerPayout.taxAmount));
  return m;
}

describe('marketplaceFeesOf - bảng tiền chi tiết đơn phía nền tảng', () => {
  it('tuyến hoa hồng, cá nhân, 2 ngày × 780.000đ: S, H, T tách GTGT/TNCN, không mã', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: FEE_POLICY_ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '1560000',
      rentalDays: 2,
      dayAmounts: ['780000', '780000'],
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      sellerEntityType: SELLER_ENTITY_TYPE.INDIVIDUAL,
    });
    const m = expectBalanced(fees);

    expect(m.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(m.serviceFeeAmount).toBe(fees.lines.find((l) => l.key === 'service_fee')!.amount);
    expect(n(m.ownerPayout.ownerCommissionAmount)).toBeGreaterThan(0);
    expect(m.ownerPayout.vatAmount).not.toBeNull();
    expect(m.ownerPayout.pitAmount).not.toBeNull();
    expect(m.promoDiscountAmount).toBe('0');
    expect(m.promoCode).toBeNull();
    expect(m.onlineAmount).toBe(fees.onlineAmount);
    expect(m.payAtPickupAmount).toBe(fees.payAtPickupAmount);
  });

  it('tuyến gói có mã khuyến mãi nền tảng: H = 0, P chỉ trừ vào phần chuyển online', () => {
    const promo: PromoCodeSnapshot = {
      promoCodeId: 'PROMO',
      code: 'VAOTHU',
      name: 'Voucher',
      discountApplied: '30000',
      appliedAt: '2026-11-16T00:00:00Z',
      discountType: PROMO_DISCOUNT_TYPE.FIXED,
      discountAmount: '30000',
      discountPercent: null,
      maxDiscountAmount: null,
      minOrderAmount: '0',
      audience: PROMO_AUDIENCE.ALL,
      vehicleScope: PROMO_VEHICLE_SCOPE.ALL,
      serviceScope: [],
      provinceCodes: [],
      perCustomerLimit: null,
    } as PromoCodeSnapshot;
    const input = {
      billingMode: BILLING_MODE.PACKAGE,
      depositRequired: true,
      policy: FEE_POLICY_ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '1560000',
      rentalDays: 2,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    } as const;
    const withPromo = computeCustomerFees({ ...input, promo });
    const without = computeCustomerFees(input);
    const m = expectBalanced(withPromo);

    expect(m.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(m.ownerPayout.ownerCommissionAmount).toBe('0');
    expect(m.promoCode).toBe('VAOTHU');
    expect(m.promoDiscountAmount).toBe('30000');
    // Mã KHÔNG đụng phần chủ xe, phần trả tay hay tiền giữ chỗ trước mã (ADR 0046 điều 2).
    expect(m.grossOnlineAmount).toBe(without.grossOnlineAmount);
    expect(m.payAtPickupAmount).toBe(without.payAtPickupAmount);
    expect(m.ownerPayout).toEqual(ownerPayoutOf(without, undefined, PERIOD));
    expect(n(m.onlineAmount)).toBe(n(without.onlineAmount) - 30000);
    // Tuyến gói không có H ⇒ nền tảng giữ đúng S, doanh thu thật S − P.
    expect(m.platformNetAmount).toBe(String(n(m.serviceFeeAmount) - 30000));
  });

  it('không có bảng phí, hoặc snapshot trước luồng tiền v2 ⇒ null, không bịa số 0', () => {
    expect(marketplaceFeesOf(null, PERIOD)).toBeNull();
    expect(marketplaceFeesOf(undefined, PERIOD)).toBeNull();
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: FEE_POLICY_ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '780000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    const legacy = { ...fees } as Partial<CustomerFeeBreakdown>;
    delete legacy.grossOnlineAmount;
    expect(marketplaceFeesOf(legacy as CustomerFeeBreakdown, PERIOD)).toBeNull();
  });
});
