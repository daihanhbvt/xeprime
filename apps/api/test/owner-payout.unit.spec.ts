import {
  BILLING_MODE,
  FEE_SCHEDULE_DEFAULTS,
  PRICE_ROW,
  SELLER_ENTITY_TYPE,
  SERVICE_TYPE,
  TAX_EXEMPT_REASON,
  VEHICLE_TYPE,
  computeCustomerFees,
  type CustomerFeeBreakdown,
  type FeePolicySnapshot,
} from '@xeprime/types';
import { ownerPayoutOf } from '../src/common/owner-payout';
import { feeDaysOf, type FeeTrip } from '../src/modules/pricing/pricing.service';
import { FEE_POLICY_ND117 } from './helpers/fee-snapshot';

/**
 * Bảng cộng ví chủ xe (ADR 0068 điều 5) — hàm THUẦN dựng `OwnerPayoutDto` cho hộp duyệt yêu cầu
 * và chi tiết đơn. Số lấy NGUYÊN từ ví dụ đối soát của đặc tả 05 §6, chạy qua đúng
 * `computeCustomerFees` mà lượt duyệt dùng — nên đây là khoá của cả chuỗi, không chỉ của phép trừ.
 *
 * Ba đẳng thức phải đúng tới ĐỒNG ở mọi ca: a = R − H − T · b = R − D − H · cộng ví = a − b = D − T.
 */
const ND117 = FEE_POLICY_ND117;

function expectIdentities(fees: CustomerFeeBreakdown, dayAmounts?: readonly string[]) {
  const p = ownerPayoutOf(fees, dayAmounts);
  const n = (v: string) => Number(v);
  expect(n(p.ownerNetAmount)).toBe(n(p.rentAmount) - n(p.ownerCommissionAmount) - n(p.taxAmount));
  expect(n(p.ownerPayableAmount)).toBe(n(p.ownerNetAmount) - n(p.payAtPickupRentAmount));
  // Cộng ví = đúng khoản XePrime chuyển cho chủ xe (`D − T`) của bảng phí.
  expect(p.ownerPayableAmount).toBe(fees.ownerPayableAmount);
  return p;
}

describe('ownerPayoutOf — đặc tả 05 §6', () => {
  it('§6.1 tự lái 1 ngày × 780.000đ, cá nhân, tuyến hoa hồng', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '780000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      sellerEntityType: SELLER_ENTITY_TYPE.INDIVIDUAL,
    });
    const p = expectIdentities(fees);
    expect(p).toEqual({
      rentAmount: '780000',
      rentalDays: 1,
      unitAmount: '780000',
      ownerCommissionAmount: '78000',
      commissionTiers: FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers,
      taxAmount: '54600',
      vatAmount: '39000',
      pitAmount: '15600',
      vatPercent: 5,
      pitPercent: 2,
      taxTotalPercent: 7,
      taxExemptReason: null,
      ownerNetAmount: '647400',
      payAtPickupRentAmount: '585000',
      ownerPayableAmount: '62400',
      collectsHold: true,
    });
  });

  it('§6.2 có tài xế 2 ngày × 1.200.000đ ⇒ GTGT 3% + TNCN 1,5%, cộng ví 252.000', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '2400000',
      rentalDays: 2,
      dayAmounts: ['1200000', '1200000'],
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
    });
    const p = expectIdentities(fees, ['1200000', '1200000']);
    expect(p.unitAmount).toBe('1200000');
    expect(p.ownerCommissionAmount).toBe('240000');
    expect([p.vatAmount, p.pitAmount, p.taxAmount]).toEqual(['72000', '36000', '108000']);
    expect([p.vatPercent, p.pitPercent]).toEqual([3, 1.5]);
    expect(p.ownerNetAmount).toBe('2052000');
    expect(p.payAtPickupRentAmount).toBe('1800000');
    expect(p.ownerPayableAmount).toBe('252000');
  });

  it('§6.3 tuyến gói, doanh nghiệp đã xác minh ⇒ T = 0 "company", cộng ví 450.000', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      depositRequired: true,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '3000000',
      rentalDays: 3,
      dayAmounts: ['1000000', '1000000', '1000000'],
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      sellerEntityType: SELLER_ENTITY_TYPE.COMPANY,
    });
    const p = expectIdentities(fees, ['1000000', '1000000', '1000000']);
    expect(p.ownerCommissionAmount).toBe('0');
    expect(p.taxAmount).toBe('0');
    expect(p.taxExemptReason).toBe(TAX_EXEMPT_REASON.COMPANY);
    expect(p.unitAmount).toBe('1000000');
    expect(p.ownerNetAmount).toBe('3000000');
    expect(p.payAtPickupRentAmount).toBe('2550000');
    expect(p.ownerPayableAmount).toBe('450000');
  });

  it('§6.3 tuyến gói, hộ kinh doanh ⇒ vẫn khấu trừ 210.000, cộng ví 240.000', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      depositRequired: true,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '3000000',
      rentalDays: 3,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      sellerEntityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
    });
    const p = expectIdentities(fees);
    expect(p.taxAmount).toBe('210000');
    expect(p.taxExemptReason).toBeNull();
    expect(p.ownerPayableAmount).toBe('240000');
  });

  it('§6.4 số lẻ thật: 585.000đ ⇒ cộng ví 46.800, không làm tròn nghìn', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '585000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    const p = expectIdentities(fees);
    expect(p.taxAmount).toBe('40950');
    expect(p.payAtPickupRentAmount).toBe('438750');
    expect(p.ownerPayableAmount).toBe('46800');
  });

  it('phí giao xe KHÔNG vào doanh thu, (a) hay (b) — dù nằm trong `payAtPickupAmount`', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '880000',
      deliveryAmount: '100000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    const p = expectIdentities(fees);
    expect(p.rentAmount).toBe('780000');
    expect(p.payAtPickupRentAmount).toBe('585000');
    expect(fees.payAtPickupAmount).toBe('685000'); // gồm G — đúng thứ bảng KHÔNG chép
  });

  it('giá khác nhau theo ngày ⇒ đơn giá null; không biết giá từng ngày ⇒ null trừ chuyến 1 ngày', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '1900000',
      rentalDays: 3,
      dayAmounts: ['600000', '600000', '700000'],
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    expect(ownerPayoutOf(fees, ['600000', '600000', '700000']).unitAmount).toBeNull();
    // Bỏ trống ⇒ đọc giá từng ngày đã đóng băng trong bảng phí — vẫn khác nhau ⇒ null.
    expect(fees.dayAmounts).toEqual(['600000', '600000', '700000']);
    expect(ownerPayoutOf(fees).unitAmount).toBeNull();
    expect(ownerPayoutOf(fees, ['633333', '633333', '633334']).unitAmount).toBeNull();
    // `null` tường minh = không biết: không bịa `R / N`.
    expect(ownerPayoutOf(fees, null).unitAmount).toBeNull();
  });

  it('chi tiết đơn: đọc giá từng ngày ĐÃ ĐÓNG BĂNG trong bảng phí ⇒ có đơn giá khi mọi ngày cùng giá', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '3000000',
      rentalDays: 3,
      dayAmounts: ['1000000', '1000000', '1000000'],
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    // Snapshot đi qua JSON (cột jsonb) — đơn giá phải sống sót qua đó.
    const frozen = JSON.parse(JSON.stringify(fees)) as CustomerFeeBreakdown;
    const p = expectIdentities(frozen);
    expect(p.unitAmount).toBe('1000000');
    expect(p.rentalDays).toBe(3);
  });

  it('snapshot CŨ không mang giá từng ngày ⇒ chuyến nhiều ngày không có đơn giá (như trước)', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '3000000',
      rentalDays: 3,
      dayAmounts: ['1000000', '1000000', '1000000'],
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    const legacy = { ...fees } as Partial<CustomerFeeBreakdown>;
    delete legacy.dayAmounts;
    expect(ownerPayoutOf(legacy as CustomerFeeBreakdown).unitAmount).toBeNull();
  });

  it('dài hạn: tiền gói chia đều cho nấc hoa hồng KHÔNG phải đơn giá / ngày', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '15000000',
      rentalDays: 30,
      dayAmounts: Array(30).fill('500000'),
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.LONG_TERM,
    });
    expect(ownerPayoutOf(fees).unitAmount).toBeNull();
  });
});

describe('ownerPayoutOf — nấc phí dịch vụ chủ xe từ chính sách ĐÃ ĐÓNG BĂNG', () => {
  const tripOn = (policy: FeePolicySnapshot, billingMode: CustomerFeeBreakdown['billingMode']) =>
    computeCustomerFees({
      billingMode,
      policy,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '780000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });

  it('tuyến hoa hồng ⇒ đúng các nấc của chính sách đã tính ra H', () => {
    expect(ownerPayoutOf(tripOn(ND117, BILLING_MODE.COMMISSION)).commissionTiers).toEqual([
      { fromDay: 1, percent: 10 },
      { fromDay: 3, percent: 7 },
      { fromDay: 8, percent: 3 },
      { fromDay: 31, percent: 0 },
    ]);
  });

  it('nấc lấy từ SNAPSHOT, không từ mặc định — chính sách đổi nấc thì bảng kể nấc mới', () => {
    const custom: FeePolicySnapshot = {
      ...ND117,
      ownerCommissionTiers: [
        { fromDay: 1, percent: 12 },
        { fromDay: 4, percent: 5 },
      ],
    };
    expect(ownerPayoutOf(tripOn(custom, BILLING_MODE.COMMISSION)).commissionTiers).toEqual([
      { fromDay: 1, percent: 12 },
      { fromDay: 4, percent: 5 },
    ]);
  });

  it('tuyến gói ⇒ null (không chịu H, dòng bị ẩn)', () => {
    expect(ownerPayoutOf(tripOn(ND117, BILLING_MODE.PACKAGE)).commissionTiers).toBeNull();
  });

  it('snapshot không mang nấc (trước luồng tiền v2) ⇒ null, không bịa con số', () => {
    const fees = tripOn(ND117, BILLING_MODE.COMMISSION);
    const policy = { ...fees.policy } as Partial<FeePolicySnapshot>;
    delete policy.ownerCommissionTiers;
    const legacy = { ...fees, policy } as CustomerFeeBreakdown;
    expect(ownerPayoutOf(legacy).commissionTiers).toBeNull();
  });
});

describe('ownerPayoutOf — snapshot cũ và báo giá tạm tính', () => {
  it('snapshot CŨ (một mức thuế, không tách) ⇒ vat/pit null, mức gộp từ dòng thuế', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '780000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    const legacy = { ...fees } as Partial<CustomerFeeBreakdown>;
    delete legacy.vatAmount;
    delete legacy.pitAmount;
    delete legacy.vatPercent;
    delete legacy.pitPercent;
    delete legacy.rentAmount;
    const p = ownerPayoutOf(legacy as CustomerFeeBreakdown);
    expect(p.vatAmount).toBeNull();
    expect(p.pitAmount).toBeNull();
    expect(p.taxAmount).toBe('54600');
    expect(p.taxTotalPercent).toBe(7);
    expect(p.rentAmount).toBe('780000');
  });

  it('báo giá tạm tính (không thu online) ⇒ collectsHold false', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: ND117,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '780000',
      rentalDays: 1,
      insuranceOffered: false,
      quoteIsEstimate: true,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
    });
    expect(ownerPayoutOf(fees).collectsHold).toBe(false);
  });
});

describe('feeDaysOf — chỉ giá NIÊM YẾT từng ngày mới được đóng băng vào bảng phí', () => {
  const breakdown = (dayAmounts: string[] | null, days: number) =>
    ({
      totalAmount: '1900000',
      rows: [{ key: PRICE_ROW.BASE, label: 'Tiền thuê', amount: '1900000' }],
      days,
      longTerm: null,
      dayAmounts,
    }) as unknown as FeeTrip['breakdown'];

  it('bảng kê có giá từng ngày ⇒ dùng nguyên mảng và đánh dấu là giá niêm yết', () => {
    const days = feeDaysOf({
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      breakdown: breakdown(['600000', '600000', '700000'], 3),
    });
    expect(days).toEqual({
      rentalDays: 3,
      dayAmounts: ['600000', '600000', '700000'],
      dayAmountsListed: true,
    });
  });

  it('bảng kê thiếu giá từng ngày ⇒ chia đều CHỈ để làm mẫu số hoa hồng, không phải giá niêm yết', () => {
    const days = feeDaysOf({
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      breakdown: breakdown(null, 3),
    });
    expect(days.dayAmounts).toEqual(['633333', '633333', '633334']);
    expect(days.dayAmountsListed).toBe(false);
  });
});
