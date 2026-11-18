import { describe, expect, it } from 'vitest';
import {
  FEE_LINE,
  FEE_SCHEDULE_DEFAULTS,
  PLATFORM_FEE_BASIS,
  TAX_RATES_DEFAULTS,
  computeCustomerFees,
  type CustomerFeeBreakdown,
  type FeePolicySnapshot,
} from './fee-policy';
import { freeCancelWindowFromPayment, holdWindowsFor } from './holds';
import { bookingRequestRespondBy } from './status/booking-request';
import {
  MIC_VCX_TRIP_DEFAULT_TIERS,
  computeValueTierPremium,
  insurancePremiumTierFor,
} from './status/insurance';
import { BILLING_MODE } from './status/billing';
import { SERVICE_TYPE, VEHICLE_TYPE } from './status/vehicle';
import { SELLER_ENTITY_TYPE } from './status/seller';

/**
 * Bộ ca kiểm thử nghiệp vụ tiền của một chuyến — dựng từ tài liệu "XePrime_Testcase_Phi_BaoHiem.docx",
 * số kỳ vọng tính theo ADR 0101 (18/11/2026): phí sàn 50k/30k theo chuyến, tiền thuê trả trước
 * `C = 30% × R` ĐÃ GỒM hoa hồng `H` (không cộng thêm), nấc hoa hồng 10/7/5/3, sàn giữ chỗ 20k,
 * thuế NĐ 117 theo loại dịch vụ, IV MIC theo bậc, phí thu hộ 10%.
 * `depositPercent` và nấc hoa hồng ghim TƯỜNG MINH: đổi mặc định không được âm thầm đổi kịch bản.
 */
const POLICY: FeePolicySnapshot = {
  ...FEE_SCHEDULE_DEFAULTS,
  depositPercent: 30,
  depositMinAmount: '0',
  ownerCommissionTiers: [
    { fromDay: 1, percent: 10 },
    { fromDay: 3, percent: 7 },
    { fromDay: 8, percent: 5 },
    { fromDay: 31, percent: 3 },
  ],
  policyId: 'TC-ADR-0101',
  version: 10,
  serviceFeePercent: 10,
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 120,
  freeCancelHours: 2,
  taxEnabled: true,
  taxRates: TAX_RATES_DEFAULTS,
  taxLegalBasis: 'NĐ 117/2025/NĐ-CP',
  taxPercent: null,
  taxLabel: null,
  tripInsuranceEnabled: false,
  tripInsurancePercent: null,
  vehicleProtectionEnabled: true,
  vehicleProtectionPercent: null,
  insurancePartnerName: 'MIC',
};

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-12-01T08:00:00+07:00');

/** Báo giá IV theo bậc cho xe `value` đ và chuyến `ms` mili-giây — đúng đường của API. */
function ivQuote(value: string, ms: number) {
  const tier = insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, T0, new Date(T0.getTime() + ms));
  if (!tier) return null;
  return {
    amount: computeValueTierPremium(value, tier.percent),
    insuredValue: value,
    maxDays: tier.maxDays,
    percent: tier.percent,
  };
}

type Input = Parameters<typeof computeCustomerFees>[0];
function fees(over: Partial<Input>): CustomerFeeBreakdown {
  return computeCustomerFees({
    billingMode: BILLING_MODE.COMMISSION,
    policy: POLICY,
    vehicleType: VEHICLE_TYPE.CAR,
    baseAmount: '0',
    rentalDays: 1,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    insuranceOffered: { vehicleProtection: true, tripInsurance: false },
    ...over,
  });
}
const line = (f: CustomerFeeBreakdown, key: string) => f.lines.find((l) => l.key === key);

describe('TC-PS phí sàn S', () => {
  it('TC-PS-01 ô tô theo chuyến = 50.000 bất kể số ngày', () => {
    const f = fees({ baseAmount: '2400000', rentalDays: 3 });
    expect(line(f, FEE_LINE.SERVICE_FEE)?.amount).toBe('50000');
  });
  it('TC-PS-02 xe máy theo chuyến = 30.000', () => {
    const f = fees({ vehicleType: VEHICLE_TYPE.MOTORBIKE, baseAmount: '300000', rentalDays: 2 });
    expect(line(f, FEE_LINE.SERVICE_FEE)?.amount).toBe('30000');
  });
  it('TC-PS-03 ô tô × số ngày: 3 ngày = 150.000, trả tay không đổi', () => {
    const f = fees({
      baseAmount: '2400000',
      rentalDays: 3,
      policy: {
        ...POLICY,
        customerPlatformFeeBasis: {
          [VEHICLE_TYPE.CAR]: PLATFORM_FEE_BASIS.PER_DAY,
          [VEHICLE_TYPE.MOTORBIKE]: PLATFORM_FEE_BASIS.PER_TRIP,
        },
      },
    });
    const s = line(f, FEE_LINE.SERVICE_FEE);
    expect([s?.unitAmount, s?.quantity, s?.amount]).toEqual(['50000', 3, '150000']);
    expect(f.customerTotalAmount).toBe('2550000');
    expect(f.onlineAmount).toBe('870000');
    expect(f.payAtPickupAmount).toBe('1680000');
  });
  it('TC-PS-04 phí sàn đặt 0 ⇒ không có dòng 0đ', () => {
    const f = fees({
      baseAmount: '1000000',
      policy: { ...POLICY, customerPlatformFee: { [VEHICLE_TYPE.CAR]: '0', [VEHICLE_TYPE.MOTORBIKE]: '0' } },
    });
    expect(line(f, FEE_LINE.SERVICE_FEE)).toBeUndefined();
  });
});

describe('TC-HH hoa hồng H', () => {
  it('TC-HH-01 3 ngày × 800.000 = 216.000', () => {
    expect(fees({ baseAmount: '2400000', rentalDays: 3 }).ownerCommissionAmount).toBe('216000');
  });
  it('TC-HH-02 dài hạn 31 ngày, 15.000.000 = 837.097 (ngày 31 = 3%)', () => {
    const f = fees({ baseAmount: '15000000', rentalDays: 31, serviceType: SERVICE_TYPE.LONG_TERM });
    expect(f.ownerCommissionAmount).toBe('837097');
  });
  it('TC-HH-03 tuyến gói ⇒ không có dòng hoa hồng', () => {
    const f = fees({ billingMode: BILLING_MODE.PACKAGE, baseAmount: '1000000', depositRequired: true });
    expect(line(f, FEE_LINE.OWNER_COMMISSION)).toBeUndefined();
    expect(f.ownerCommissionAmount).toBe('0');
  });
});

describe('TC-TH thuế T', () => {
  it('TC-TH-01 tự lái 7%: GTGT 120.000 + TNCN 48.000', () => {
    const f = fees({ baseAmount: '2400000', rentalDays: 3 });
    expect([f.vatAmount, f.pitAmount, f.taxAmount]).toEqual(['120000', '48000', '168000']);
  });
  it('TC-TH-02 có tài xế 4,5%, không tính trên phí giao G', () => {
    const f = fees({
      baseAmount: '1400000',
      deliveryAmount: '200000',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
    });
    expect([f.vatAmount, f.pitAmount, f.taxAmount]).toEqual(['36000', '18000', '54000']);
  });
  it('TC-TH-03 doanh nghiệp đã xác minh ⇒ T = 0', () => {
    const f = fees({
      billingMode: BILLING_MODE.PACKAGE,
      baseAmount: '5000000',
      rentalDays: 5,
      depositRequired: true,
      sellerEntityType: SELLER_ENTITY_TYPE.COMPANY,
    });
    expect(f.taxAmount).toBe('0');
    expect(f.onlineAmount).toBe('1550000');
    expect(f.ownerPayableAmount).toBe('1500000');
  });
  it('TC-TH-04 thiếu hồ sơ người bán ⇒ coi là cá nhân', () => {
    expect(fees({ baseAmount: '1000000', sellerEntityType: null }).taxAmount).toBe('70000');
  });
  it('TC-TH-05 làm tròn tới đồng', () => {
    const f = fees({ vehicleType: VEHICLE_TYPE.MOTORBIKE, baseAmount: '333333' });
    expect([f.ownerCommissionAmount, f.vatAmount, f.pitAmount, f.depositAmount]).toEqual([
      '33333',
      '16667',
      '6667',
      '66667',
    ]);
  });
});

describe('TC-BH bảo hiểm vật chất xe IV (MIC theo bậc) + phí thu hộ X', () => {
  const V = '500000000';
  it.each([
    ['TC-BH-01 đúng 2 ngày', 2 * DAY, '65000'],
    ['TC-BH-02 2 ngày + 1 phút', 2 * DAY + 60_000, '165000'],
    ['TC-BH-03 10 ngày', 10 * DAY, '330000'],
    ['TC-BH-04 15 ngày', 15 * DAY, '490000'],
    ['TC-BH-05 30 ngày', 30 * DAY, '1000000'],
  ])('%s', (_n, ms, amount) => {
    expect(ivQuote(V, ms)?.amount).toBe(amount);
  });
  it('TC-BH-06 quá 30 ngày ⇒ ngoài phạm vi, không bán', () => {
    expect(ivQuote(V, 30 * DAY + 3_600_000)).toBeNull();
  });
  it('TC-BH-07 khách tích: IV 165.000 + X 16.500, chủ xe không đổi', () => {
    const f = fees({
      baseAmount: '2400000',
      rentalDays: 3,
      vehicleProtectionTier: ivQuote(V, 3 * DAY),
      vehicleProtectionSelected: true,
      insuranceServiceFeePercent: 10,
    });
    expect(line(f, FEE_LINE.VEHICLE_PROTECTION)?.amount).toBe('165000');
    expect(f.insuranceServiceFeeAmount).toBe('16500');
    expect(f.customerTotalAmount).toBe('2631500');
    expect(f.onlineAmount).toBe('951500');
    expect(f.payAtPickupAmount).toBe('1680000');
    expect(f.ownerPayableAmount).toBe('336000');
  });
  it('TC-BH-08 Tuỳ chọn, khách KHÔNG tích ⇒ có lời chào bán, không thu', () => {
    const f = fees({
      baseAmount: '2400000',
      rentalDays: 3,
      vehicleProtectionTier: ivQuote(V, 3 * DAY),
      insuranceServiceFeePercent: 10,
    });
    expect(line(f, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
    expect(f.vehicleProtectionOffer).toEqual({ amount: '165000', required: false, serviceFeeAmount: '16500' });
    expect(f.customerTotalAmount).toBe('2450000');
  });
  it('TC-BH-09 chủ xe đặt Bắt buộc ⇒ thu dù khách không tích', () => {
    const f = fees({
      baseAmount: '2400000',
      rentalDays: 3,
      vehicleProtectionTier: ivQuote(V, 3 * DAY),
      vehicleProtectionRequired: true,
      insuranceServiceFeePercent: 10,
    });
    expect(f.vehicleProtectionMandatory).toBe(true);
    expect(line(f, FEE_LINE.VEHICLE_PROTECTION)?.amount).toBe('165000');
  });
  it('TC-BH-10 xe không đủ điều kiện (tier = null) ⇒ không có IV', () => {
    const f = fees({ baseAmount: '1000000', vehicleProtectionTier: null, vehicleProtectionSelected: true });
    expect(line(f, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
  });
  it('TC-BH-11 chưa có đối tác (cổng đóng) ⇒ không thu dù khách tích', () => {
    const f = fees({
      baseAmount: '1000000',
      insuranceOffered: false,
      vehicleProtectionTier: ivQuote(V, DAY),
      vehicleProtectionSelected: true,
      insuranceServiceFeePercent: 10,
    });
    expect(line(f, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
    expect(f.insuranceServiceFeeAmount).toBe('0');
  });
  it('TC-BH-12 phí thu hộ tắt ⇒ X = 0', () => {
    const f = fees({
      baseAmount: '1000000',
      vehicleProtectionTier: ivQuote(V, DAY),
      vehicleProtectionSelected: true,
    });
    expect(f.insuranceServiceFeeAmount).toBe('0');
    expect(line(f, FEE_LINE.INSURANCE_SERVICE_FEE)).toBeUndefined();
  });
  it('TC-BH-13 IP đang tắt ⇒ khách tích cũng không thu', () => {
    const f = fees({ baseAmount: '1000000', personalAccidentSelected: true });
    expect(line(f, FEE_LINE.TRIP_INSURANCE)).toBeUndefined();
  });
});

describe('TC-GC tiền giữ chỗ / trả tay', () => {
  it('TC-GC-01 tuyến hoa hồng, ô tô 3 ngày, không BH', () => {
    const f = fees({ baseAmount: '2400000', rentalDays: 3 });
    expect([f.customerTotalAmount, f.onlineAmount, f.depositAmount, f.payAtPickupAmount]).toEqual([
      '2450000',
      '770000',
      '504000',
      '1680000',
    ]);
    expect([f.ownerPayableAmount, f.ownerNetAmount, f.platformRetainedAmount]).toEqual([
      '336000',
      '2016000',
      '266000',
    ]);
  });
  it('TC-GC-02 gian hàng gói, xe máy, cọc TẮT ⇒ online = S + T', () => {
    const f = fees({
      billingMode: BILLING_MODE.PACKAGE,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '300000',
      rentalDays: 2,
      depositRequired: false,
    });
    expect([f.onlineAmount, f.payAtPickupAmount, f.ownerPayableAmount]).toEqual(['51000', '279000', '0']);
  });
  it('TC-GC-03 gian hàng gói, xe máy, cọc BẬT', () => {
    const f = fees({
      billingMode: BILLING_MODE.PACKAGE,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '300000',
      rentalDays: 2,
      depositRequired: true,
    });
    expect([f.onlineAmount, f.payAtPickupAmount, f.ownerPayableAmount]).toEqual(['120000', '210000', '69000']);
  });
  it('TC-GC-04 có tài xế + phí giao: G không vào QR', () => {
    const f = fees({ baseAmount: '1400000', deliveryAmount: '200000', serviceType: SERVICE_TYPE.WITH_DRIVER });
    expect([f.customerTotalAmount, f.onlineAmount, f.payAtPickupAmount, f.ownerPayableAmount]).toEqual([
      '1450000',
      '410000',
      '1040000',
      '186000',
    ]);
  });
  it('TC-GC-05 dài hạn 31 ngày', () => {
    const f = fees({ baseAmount: '15000000', rentalDays: 31, serviceType: SERVICE_TYPE.LONG_TERM });
    expect([f.onlineAmount, f.payAtPickupAmount, f.ownerPayableAmount, f.ownerNetAmount]).toEqual([
      '4550000',
      '10500000',
      '2612903',
      '13112903',
    ]);
  });
  it('TC-GC-06 báo giá tạm tính ⇒ không thu online, không QR', () => {
    const f = fees({ baseAmount: '15000000', rentalDays: 31, quoteIsEstimate: true });
    expect(f.holdAmount).toBeNull();
    expect(f.depositAmount).toBe('0');
  });
  it('TC-GC-07 chuyến nhỏ ⇒ nâng lên sàn giữ chỗ 20.000', () => {
    const f = fees({
      billingMode: BILLING_MODE.PACKAGE,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '100000',
      depositRequired: false,
      sellerEntityType: SELLER_ENTITY_TYPE.COMPANY,
      policy: { ...POLICY, customerPlatformFee: { [VEHICLE_TYPE.CAR]: '50000', [VEHICLE_TYPE.MOTORBIKE]: '10000' } },
    });
    expect(f.onlineAmount).toBe('20000');
  });
});

describe('TC-KM mã khuyến mãi nền tảng', () => {
  const promo = (discountApplied: string) =>
    ({ discountApplied }) as unknown as NonNullable<Input['promo']>;
  it('TC-KM-01 mã 100.000: khách giảm, chủ xe không đổi', () => {
    const f = fees({ baseAmount: '2400000', rentalDays: 3, promo: promo('100000') });
    expect([f.onlineAmount, f.customerTotalAmount, f.ownerPayableAmount, f.payAtPickupAmount]).toEqual([
      '670000',
      '2350000',
      '336000',
      '1680000',
    ]);
  });
  it('TC-KM-02 mã quá lớn ⇒ kẹp, online còn đúng sàn 20.000', () => {
    const f = fees({ baseAmount: '2400000', rentalDays: 3, promo: promo('1000000') });
    expect([f.promoDiscountAmount, f.onlineAmount]).toEqual(['750000', '20000']);
  });
  it('TC-KM-03 mã không lấn vào IV + X', () => {
    const f = fees({
      baseAmount: '2400000',
      rentalDays: 3,
      vehicleProtectionTier: ivQuote('500000000', 3 * DAY),
      vehicleProtectionSelected: true,
      insuranceServiceFeePercent: 10,
      promo: promo('5000000'),
    });
    expect(f.onlineAmount).toBe('181500');
  });
});

describe('TC-CS cửa sổ thời gian', () => {
  const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
  it.each([
    ['TC-CS-01 ΔT 2h ⇒ trả trong 36′', 120, 36],
    ['TC-CS-02 ΔT 30′ ⇒ sàn 15′', 30, 15],
    ['TC-CS-03 ΔT 10h ⇒ trần 120′', 600, 120],
  ])('%s', (_n, lead, expected) => {
    const w = holdWindowsFor({ acceptedAt: T0, pickupAt: at(lead), freeCancelHours: 2, paymentWindowMinutes: 120 });
    expect(w.paymentWindowMinutes).toBe(expected);
  });
  it('TC-CS-04 ΔT 10′ ⇒ hạn trả kẹp bởi giờ nhận xe', () => {
    const w = holdWindowsFor({ acceptedAt: T0, pickupAt: at(10), freeCancelHours: 2, paymentWindowMinutes: 120 });
    expect(w.expiresAt.getTime()).toBe(at(10).getTime());
  });
  it('TC-CS-05 trả đủ lúc còn 5h ⇒ huỷ miễn phí 60′ từ lúc trả', () => {
    const r = freeCancelWindowFromPayment({ paidAt: T0, pickupAt: at(300), freeCancelHours: 2 });
    expect(r.freeCancelMinutes).toBe(60);
  });
  it('TC-CS-06 trả đủ lúc còn 3 ngày ⇒ trần 2h', () => {
    const r = freeCancelWindowFromPayment({ paidAt: T0, pickupAt: at(3 * 1440), freeCancelHours: 2 });
    expect(r.freeCancelMinutes).toBe(120);
  });
  it('TC-CS-07 hạn phản hồi: gửi trước ≥ 24h ⇒ 240′', () => {
    expect(bookingRequestRespondBy(T0, at(2 * 1440)).getTime()).toBe(at(240).getTime());
  });
  it('TC-CS-08 hạn phản hồi: gửi trước 3h ⇒ 36′', () => {
    expect(bookingRequestRespondBy(T0, at(180)).getTime()).toBe(at(36).getTime());
  });
});
