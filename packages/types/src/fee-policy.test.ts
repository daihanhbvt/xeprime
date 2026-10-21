import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_TARGET,
  FEE_BEARER,
  FEE_BENEFICIARY,
  FEE_LINE,
  FEE_SCHEDULE_DEFAULTS,
  allocationTotals,
  computeCustomerFees,
  customerHoldAllocation,
  insuranceOfferedByKind,
  computeTieredOwnerCommission,
  feePolicyActivationBlockers,
  ownerCommissionPercentForDay,
  floorToThousand,
  isThousandStep,
  resolveHoldAllocation,
  roundToThousand,
  toPublicFeeBreakdown,
  type CustomerFeeBreakdown,
  type FeeLineKey,
  type FeePolicySnapshot,
  type HoldMoneyLines,
} from './fee-policy';
import { HOLD_MIN_USABLE_WINDOW_MINUTES } from './holds';
import { BILLING_MODE } from './status/billing';
import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES } from './status/vehicle';

/**
 * Phép tính tiền của một chuyến — luồng tiền v2. Đây là số in lên VietQR và số chia vào sổ ví,
 * nên mọi nhánh làm tròn và mọi cổng bật/tắt đều phải có một dòng khẳng định.
 */
const MIC = 'Tổng công ty Cổ phần Bảo hiểm Quân đội (MIC)';

const PILOT: FeePolicySnapshot = {
  ...FEE_SCHEDULE_DEFAULTS,
  policyId: '01POLICY',
  version: 2,
  serviceFeePercent: 10,
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 120,
  freeCancelHours: 4,
  depositMinAmount: '50000',
  depositMaxPercent: 50,
  taxEnabled: false,
  taxPercent: null,
  taxLabel: null,
  tripInsuranceEnabled: true,
  tripInsurancePercent: null,
  vehicleProtectionEnabled: true,
  vehicleProtectionPercent: null,
  insurancePartnerName: MIC,
};

type FeeInput = Parameters<typeof computeCustomerFees>[0];

/** Ví dụ chuẩn của bản thiết kế: ô tô 5 ngày × 1.000.000đ, tuyến hoa hồng, không bảo hiểm. */
function fees(over: Partial<FeeInput> = {}): CustomerFeeBreakdown {
  return computeCustomerFees({
    billingMode: BILLING_MODE.COMMISSION,
    policy: PILOT,
    vehicleType: VEHICLE_TYPE.CAR,
    baseAmount: '5000000',
    rentalDays: 5,
    insuranceOffered: true,
    ...over,
  });
}

const lineOf = (r: CustomerFeeBreakdown, key: FeeLineKey) => r.lines.find((l) => l.key === key);
const amountOf = (r: CustomerFeeBreakdown, key: FeeLineKey) => Number(lineOf(r, key)?.amount ?? 0);

/** Các dòng tiền của hold sinh ra từ một bảng phí — đúng cách tạo hold sẽ đọc nó. */
function holdLinesOf(r: CustomerFeeBreakdown): HoldMoneyLines {
  return {
    deposit: r.depositAmount,
    serviceFee: String(amountOf(r, FEE_LINE.SERVICE_FEE)),
    ownerCommission: r.ownerCommissionAmount,
    vehicleInsurance: String(amountOf(r, FEE_LINE.VEHICLE_PROTECTION)),
    personalInsurance: String(amountOf(r, FEE_LINE.TRIP_INSURANCE)),
    promoDiscount: r.promoDiscountAmount,
  };
}

describe('roundToThousand — bước giá 1.000đ', () => {
  it('làm tròn tới 1.000đ gần nhất, nửa bước làm tròn LÊN', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [499, 0],
      [500, 1000],
      [1499, 1000],
      [1500, 2000],
      [100_200, 100_000],
      [100_500, 101_000],
      [757_500, 758_000],
      [1_515_000, 1_515_000],
    ];
    for (const [input, expected] of cases) {
      expect({ input, out: roundToThousand(input) }).toEqual({ input, out: expected });
    }
  });
});

describe('floorToThousand / isThousandStep', () => {
  it('làm tròn XUỐNG tới bước 1.000đ', () => {
    expect([0, 999, 1000, 1999, 50_590, 88_515].map(floorToThousand)).toEqual([
      0, 0, 1000, 1000, 50_000, 88_000,
    ]);
  });

  it('bội không âm của 1.000đ — nhận số lẫn chuỗi, rác/âm/rỗng là sai', () => {
    expect([0, 1000, '50000', '1000000'].every(isThousandStep)).toBe(true);
    expect([500, 1500, '50500', '-1000', '', 'abc', Number.NaN].some(isThousandStep)).toBe(false);
  });
});

describe('computeTieredOwnerCommission — hoa hồng lũy tiến theo từng ngày thuê', () => {
  const tiers = FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers;

  it('ví dụ chuẩn: 5 ngày × 1.000.000đ ⇒ 100k + 100k + 70k + 70k + 70k = 410.000đ', () => {
    expect(computeTieredOwnerCommission(Array(5).fill('1000000'), tiers)).toBe('410000');
  });

  it('mốc nấc: ngày 1–2 là 10%, ngày 3–7 là 7%, ngày 8–30 là 3%, từ ngày 31 là 0%', () => {
    const days = [1, 2, 3, 7, 8, 30, 31, 365];
    expect(days.map((day) => ownerCommissionPercentForDay(day, tiers))).toEqual([
      10, 10, 7, 7, 3, 3, 0, 0,
    ]);
  });

  it('từ ngày 31 không thu thêm: 35 ngày và 30 ngày cùng ra 1.240.000đ', () => {
    // 2 × 100k + 5 × 70k + 23 × 30k = 200k + 350k + 690k.
    expect(computeTieredOwnerCommission(Array(30).fill(1_000_000), tiers)).toBe('1240000');
    expect(computeTieredOwnerCommission(Array(35).fill(1_000_000), tiers)).toBe('1240000');
  });

  it('giá từng ngày khác nhau ⇒ % áp trên giá CỦA NGÀY ĐÓ', () => {
    // 800k × 10% + 1.200k × 10% + 1.200k × 7% = 80k + 120k + 84k.
    expect(computeTieredOwnerCommission(['800000', '1200000', '1200000'], tiers)).toBe('284000');
  });

  it('làm tròn 1.000đ MỘT lần trên tổng, không làm tròn từng ngày', () => {
    // 33.333,3 + 33.333,3 + 23.333,31 = 89.999,91 ⇒ 90.000 (tròn từng ngày sẽ ra 89.000).
    expect(computeTieredOwnerCommission(['333333', '333333', '333333'], tiers)).toBe('90000');
  });

  it('không có ngày nào ⇒ 0đ; giá ngày rác hoặc âm ⇒ ném, không im lặng cho ra 0', () => {
    expect(computeTieredOwnerCommission([], tiers)).toBe('0');
    expect(() => computeTieredOwnerCommission(['abc'], tiers)).toThrow();
    expect(() => computeTieredOwnerCommission(['-1000'], tiers)).toThrow();
  });
});

describe('computeCustomerFees — ví dụ chuẩn: ô tô 5 ngày × 1.000.000đ, tuyến HOA HỒNG', () => {
  /**
   * Ca này khoá TOÀN BỘ công thức bằng đúng các con số bản thiết kế in ra (bảng 2.3, cột "Tuyến
   * Hoa hồng"). Nếu nó đỏ thì hoặc code sai, hoặc thiết kế đã đổi — không có khả năng thứ ba, và
   * không được sửa số ở đây để nó xanh lại.
   */
  it('B 5.000.000 · phí sàn 50.000 ⇒ khách trả 5.050.000; cọc 1.515.000; trả tay 3.535.000', () => {
    const r = fees();
    expect(r.baseAmount).toBe('5000000');
    expect(r.customerFeeTotal).toBe('50000');
    expect(r.customerTotalAmount).toBe('5050000');
    expect(r.grossOnlineAmount).toBe('1515000');
    expect(r.onlineAmount).toBe('1515000');
    expect(r.holdAmount).toBe('1515000');
    expect(r.payAtPickupAmount).toBe('3535000');
  });

  it('hoa hồng 410.000 · sàn giữ 460.000 ⇒ sàn chuyển ví chủ xe 1.055.000, chủ xe nhận 4.590.000', () => {
    const r = fees();
    expect(r.ownerCommissionAmount).toBe('410000');
    expect(r.platformRetainedAmount).toBe('460000');
    expect(r.depositAmount).toBe('1055000');
    expect(r.ownerPayableAmount).toBe('1055000');
    expect(r.ownerNetAmount).toBe('4590000');
  });

  it('phí sàn là dòng KHÁCH trả; hoa hồng là dòng CHỦ XE chịu và không vào tổng khách', () => {
    const r = fees();
    expect(r.lines).toEqual([
      {
        key: FEE_LINE.SERVICE_FEE,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.CUSTOMER,
        percent: null,
        amount: '50000',
      },
      {
        key: FEE_LINE.OWNER_COMMISSION,
        beneficiary: FEE_BENEFICIARY.PLATFORM,
        bearer: FEE_BEARER.OWNER,
        percent: null,
        amount: '410000',
      },
    ]);
    expect(r.vehicleType).toBe(VEHICLE_TYPE.CAR);
    expect(r.rentalDays).toBe(5);
  });

  it('ba đẳng thức bảo toàn của bản thiết kế', () => {
    const r = fees();
    // Tiền mặt nhận xe = Tổng khách trả − Cọc online.
    expect(Number(r.payAtPickupAmount)).toBe(
      Number(r.customerTotalAmount) - Number(r.onlineAmount),
    );
    // Sàn chuyển chủ xe = Cọc online − Sàn giữ lại.
    expect(Number(r.ownerPayableAmount)).toBe(
      Number(r.onlineAmount) - Number(r.platformRetainedAmount),
    );
    // Chủ xe nhận tổng = Tiền thuê gốc − Hoa hồng = Trả nhận xe + Sàn chuyển.
    expect(Number(r.ownerNetAmount)).toBe(Number(r.baseAmount) - Number(r.ownerCommissionAmount));
    expect(Number(r.ownerNetAmount)).toBe(
      Number(r.payAtPickupAmount) + Number(r.ownerPayableAmount),
    );
  });

  it('giá từng ngày (dayAmounts) thắng phép chia đều', () => {
    const r = fees({
      baseAmount: '3200000',
      rentalDays: 3,
      dayAmounts: ['800000', '1200000', '1200000'],
    });
    expect(r.ownerCommissionAmount).toBe('284000');
    // Chia đều 3.200.000 / 3 ngày sẽ ra 288.000 — khác, và đó là lý do có tham số này.
    expect(fees({ baseAmount: '3200000', rentalDays: 3 }).ownerCommissionAmount).toBe('288000');
  });
});

describe('computeCustomerFees — ví dụ chuẩn ADR 0064: thuế 10% trên tiền thuê, giao xe 200.000 trả tận tay', () => {
  /**
   * Ô tô 5 ngày × 1.000.000đ, giao xe tận nơi 200.000đ, phí sàn 50.000đ, thuế 10%.
   *
   * Hai quyết định 21/10/2026 khoá ở đây bằng chính con số: (1) thuế và hoa hồng tính trên TIỀN
   * THUÊ 5.000.000 — không trên 5.200.000; (2) phí giao không vào mẫu số cọc 30% và không bao giờ
   * nằm trong mã QR — nó rơi trọn vào phần khách trả tận tay chủ xe. Không sửa số để test xanh.
   */
  const TAX10: FeePolicySnapshot = {
    ...PILOT,
    taxEnabled: true,
    taxPercent: 10,
    taxLabel: 'Thuế khấu trừ',
  };
  const trip = (over: Partial<FeeInput> = {}) =>
    fees({
      policy: TAX10,
      baseAmount: '5200000',
      deliveryAmount: '200000',
      dayAmounts: Array(5).fill('1000000'),
      ...over,
    });
  const settled = (r: CustomerFeeBreakdown) =>
    allocationTotals(resolveHoldAllocation(holdLinesOf(r), 'settled', r.taxAmount));

  it('tuyến hoa hồng, không bảo hiểm: H 410.000 · T 500.000 · QR 1.515.000 · trả tay 3.735.000', () => {
    const r = trip();
    expect(r.deliveryAmount).toBe('200000');
    expect(r.ownerCommissionAmount).toBe('410000');
    expect(r.taxAmount).toBe('500000');
    expect(r.customerTotalAmount).toBe('5250000');
    // 30% × (5.250.000 − 200.000 giao xe) = 1.515.000 — phí giao không vào mẫu số.
    expect(r.onlineAmount).toBe('1515000');
    expect(r.holdAmount).toBe('1515000');
    expect(r.payAtPickupAmount).toBe('3735000'); // gồm trọn 200.000 phí giao
    expect(r.depositAmount).toBe('1055000'); // D = 1.515.000 − 50.000 − 410.000
    expect(r.platformRetainedAmount).toBe('460000');
    expect(r.ownerPayableAmount).toBe('555000'); // D − T
    // Chủ xe nhận cho TIỀN THUÊ = R − H − T = 5.000.000 − 410.000 − 500.000; phí giao 200.000 đi riêng.
    expect(r.ownerNetAmount).toBe('4090000');
    expect(r.taxableBaseAmount).toBe('5000000');
    const totals = settled(r);
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('555000'); // ví chủ xe
    expect(totals[ALLOCATION_TARGET.TAX_LEDGER]).toBe('500000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('460000');
  });

  it('tuyến hoa hồng, bảo hiểm vật chất 50.000/ngày: QR 1.590.000 · trả tay 3.910.000', () => {
    const r = trip({ vehicleProtectionSelected: true });
    expect(amountOf(r, FEE_LINE.VEHICLE_PROTECTION)).toBe(250000);
    expect(r.ownerCommissionAmount).toBe('410000');
    expect(r.taxAmount).toBe('500000');
    expect(r.customerTotalAmount).toBe('5500000');
    expect(r.onlineAmount).toBe('1590000'); // 30% × 5.300.000
    expect(r.payAtPickupAmount).toBe('3910000');
    expect(r.depositAmount).toBe('880000');
    expect(r.ownerPayableAmount).toBe('380000');
    expect(r.ownerNetAmount).toBe('4090000');
    const totals = settled(r);
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('380000');
    expect(totals[ALLOCATION_TARGET.INSURER_PAYABLE]).toBe('250000');
    expect(totals[ALLOCATION_TARGET.TAX_LEDGER]).toBe('500000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('460000');
  });

  it('tuyến gói, bật thu cọc: H = 0 · QR 1.515.000 · ví chủ xe 965.000 · chủ xe nhận 4.500.000', () => {
    const r = trip({ billingMode: BILLING_MODE.PACKAGE, depositRequired: true });
    expect(lineOf(r, FEE_LINE.OWNER_COMMISSION)).toBeUndefined();
    expect(r.ownerCommissionAmount).toBe('0');
    expect(r.taxAmount).toBe('500000');
    expect(r.onlineAmount).toBe('1515000');
    expect(r.payAtPickupAmount).toBe('3735000');
    expect(r.depositAmount).toBe('1465000');
    expect(r.platformRetainedAmount).toBe('50000');
    expect(r.ownerPayableAmount).toBe('965000');
    expect(r.ownerNetAmount).toBe('4500000'); // R − T, phí giao 200.000 đi riêng
    expect(settled(r)[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('965000');
  });

  it('phí giao KHÔNG vào mã QR: thêm 200.000 giao xe chỉ đổi phần trả tay, đúng 200.000', () => {
    const withDelivery = trip();
    const without = fees({
      policy: TAX10,
      baseAmount: '5000000',
      dayAmounts: Array(5).fill('1000000'),
    });
    expect(withDelivery.onlineAmount).toBe(without.onlineAmount);
    expect(withDelivery.taxAmount).toBe(without.taxAmount);
    expect(withDelivery.ownerCommissionAmount).toBe(without.ownerCommissionAmount);
    expect(Number(withDelivery.payAtPickupAmount) - Number(without.payAtPickupAmount)).toBe(200000);
    // Phí giao là tiền mặt chủ xe nhận tận tay, hiện riêng — không đổi "chủ xe nhận cho tiền thuê".
    expect(withDelivery.ownerNetAmount).toBe(without.ownerNetAmount);
    expect(withDelivery.taxableBaseAmount).toBe('5000000');
  });

  it('không có giá từng ngày ⇒ chia đều TIỀN THUÊ, không chia đều cả phí giao', () => {
    // 5.200.000 / 5 = 1.040.000/ngày sẽ ra H = 426.400 — thu hoa hồng trên phí giao.
    const r = fees({ policy: TAX10, baseAmount: '5200000', deliveryAmount: '200000' });
    expect(r.ownerCommissionAmount).toBe('410000');
  });

  it('sàn cọc vượt 30%: xe máy 1 ngày 100.000, hai gói bảo hiểm, thuế 10%, giao 50.000', () => {
    /*
     * S 30.000 + H 10.000 + IV 15.000 + IP 5.000 + T 10.000 = 70.000 > 30% × 150.000 = 45.000:
     * cọc nâng lên đủ phần không phải của chủ xe, và phí giao vẫn nằm trọn ngoài mã QR.
     */
    const r = fees({
      policy: TAX10,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '150000',
      deliveryAmount: '50000',
      rentalDays: 1,
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(r.taxAmount).toBe('10000');
    expect(r.onlineAmount).toBe('70000');
    expect(r.depositAmount).toBe('10000');
    expect(r.ownerPayableAmount).toBe('0');
    expect(r.payAtPickupAmount).toBe('130000');
    // R − H − T = 100.000 − 10.000 − 10.000; phí giao 50.000 chủ xe nhận tận tay, đi riêng.
    expect(r.ownerNetAmount).toBe('80000');
  });

  it('phí giao âm, rác hoặc lớn hơn cả B ⇒ ném', () => {
    expect(() => trip({ deliveryAmount: '-1000' })).toThrow();
    expect(() => trip({ deliveryAmount: 'abc' })).toThrow();
    expect(() => trip({ deliveryAmount: '6000000' })).toThrow();
  });
});

describe('computeCustomerFees — insuranceOffered là cổng của NỀN TẢNG', () => {
  it('false ⇒ không bao giờ có IV/IP, dù khách tích và chính sách đang mở', () => {
    const r = fees({
      insuranceOffered: false,
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(lineOf(r, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
    expect(lineOf(r, FEE_LINE.TRIP_INSURANCE)).toBeUndefined();
    expect(r.customerTotalAmount).toBe('5050000');
    expect(r.onlineAmount).toBe('1515000');
  });

  it('true + khách tích ⇒ có dòng (đối chứng)', () => {
    const r = fees({ insuranceOffered: true, vehicleProtectionSelected: true });
    expect(amountOf(r, FEE_LINE.VEHICLE_PROTECTION)).toBe(250000);
  });

  it('theo TỪNG sản phẩm (ADR 0064): sản phẩm bị tắt ⇒ không thu dù client cũ gửi selected', () => {
    const onlyIp = fees({
      insuranceOffered: { vehicleProtection: false, tripInsurance: true },
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(lineOf(onlyIp, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
    expect(lineOf(onlyIp, FEE_LINE.TRIP_INSURANCE)).toBeDefined();

    const onlyIv = fees({
      insuranceOffered: { vehicleProtection: true, tripInsurance: false },
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(lineOf(onlyIv, FEE_LINE.VEHICLE_PROTECTION)).toBeDefined();
    expect(lineOf(onlyIv, FEE_LINE.TRIP_INSURANCE)).toBeUndefined();
  });

  it('insuranceOfferedByKind: boolean áp cho cả hai sản phẩm', () => {
    expect(insuranceOfferedByKind(true)).toEqual({ vehicleProtection: true, tripInsurance: true });
    expect(insuranceOfferedByKind(false)).toEqual({ vehicleProtection: false, tripInsurance: false });
  });
});

describe('toPublicFeeBreakdown — khách KHÔNG thấy kinh tế của chủ xe', () => {
  it('bỏ H, T, D, ví chủ xe, chủ xe thực nhận, sàn giữ lại, phần tài trợ được và nấc hoa hồng', () => {
    const full = fees({
      policy: { ...PILOT, taxEnabled: true, taxPercent: 10, taxLabel: 'T' },
      vehicleProtectionSelected: true,
    });
    const pub = toPublicFeeBreakdown(full) as unknown as Record<string, unknown>;
    for (const key of [
      'ownerCommissionAmount',
      'platformRetainedAmount',
      'ownerNetAmount',
      'ownerPayableAmount',
      'taxAmount',
      'taxableBaseAmount',
      'depositAmount',
      'sponsorableAmount',
      'billingMode',
    ]) {
      expect({ key, present: key in pub }).toEqual({ key, present: false });
    }
    const policy = pub.policy as Record<string, unknown>;
    for (const key of ['ownerCommissionTiers', 'taxEnabled', 'taxPercent', 'serviceFeePercent']) {
      expect({ key, present: key in policy }).toEqual({ key, present: false });
    }
    const lines = pub.lines as { bearer: string; key: string }[];
    expect(lines.every((line) => line.bearer === FEE_BEARER.CUSTOMER)).toBe(true);
    expect(lines.map((line) => line.key)).toEqual([
      FEE_LINE.SERVICE_FEE,
      FEE_LINE.VEHICLE_PROTECTION,
    ]);
  });

  it('các con số khách trả giữ NGUYÊN', () => {
    const full = fees({ vehicleProtectionSelected: true });
    const pub = toPublicFeeBreakdown(full);
    expect(pub.customerTotalAmount).toBe(full.customerTotalAmount);
    expect(pub.onlineAmount).toBe(full.onlineAmount);
    expect(pub.holdAmount).toBe(full.holdAmount);
    expect(pub.payAtPickupAmount).toBe(full.payAtPickupAmount);
    expect(pub.customerFeeTotal).toBe(full.customerFeeTotal);
  });
});

describe('computeCustomerFees — tuyến GÓI (0% hoa hồng)', () => {
  it('bật thu cọc ⇒ đúng cột "Tuyến Gói tháng" của bản thiết kế', () => {
    const r = fees({ billingMode: BILLING_MODE.PACKAGE, depositRequired: true });
    expect(lineOf(r, FEE_LINE.OWNER_COMMISSION)).toBeUndefined();
    expect(r.customerTotalAmount).toBe('5050000');
    expect(r.onlineAmount).toBe('1515000');
    expect(r.payAtPickupAmount).toBe('3535000');
    expect(r.ownerCommissionAmount).toBe('0');
    expect(r.platformRetainedAmount).toBe('50000');
    expect(r.ownerPayableAmount).toBe('1465000');
    expect(r.ownerNetAmount).toBe('5000000');
  });

  it('gian hàng TẮT thu cọc ⇒ online đúng bằng phí sàn, chủ xe nhận đủ 100% tiền thuê tận tay', () => {
    /*
     * Phí sàn là tiền của XePrime và XePrime không thu hộ phần trả tay — nên kể cả khi không thu
     * cọc, khoản online vẫn phải có, và chỉ đúng bằng phần không thuộc về chủ xe.
     */
    const r = fees({ billingMode: BILLING_MODE.PACKAGE, depositRequired: false });
    expect(r.holdAmount).toBe('50000');
    expect(r.depositAmount).toBe('0');
    expect(r.payAtPickupAmount).toBe('5000000');
    expect(r.ownerPayableAmount).toBe('0');
    expect(r.ownerNetAmount).toBe('5000000');
  });

  it('tuyến gói KHÔNG truyền depositRequired ⇒ mặc định không thu cọc', () => {
    const r = fees({ billingMode: BILLING_MODE.PACKAGE });
    expect(r.onlineAmount).toBe('50000');
  });

  it('tuyến hoa hồng KHÔNG truyền depositRequired ⇒ mặc định LUÔN thu cọc', () => {
    expect(fees().holdAmount).toBe('1515000');
  });
});

describe('computeCustomerFees — bảo hiểm MIC là TUỲ CHỌN, tính theo ngày', () => {
  it('khách tích vật chất xe ô tô (50.000đ × 5 ngày) ⇒ tổng 5.300.000, cọc 1.590.000, trả tay 3.710.000', () => {
    const r = fees({ vehicleProtectionSelected: true });
    expect(lineOf(r, FEE_LINE.VEHICLE_PROTECTION)).toEqual({
      key: FEE_LINE.VEHICLE_PROTECTION,
      beneficiary: FEE_BENEFICIARY.INSURER,
      bearer: FEE_BEARER.CUSTOMER,
      percent: null,
      unitAmount: '50000',
      quantity: 5,
      amount: '250000',
      partnerName: MIC,
    });
    expect(r.customerTotalAmount).toBe('5300000');
    expect(r.onlineAmount).toBe('1590000');
    expect(r.payAtPickupAmount).toBe('3710000');
    // 250.000 là tiền giữ hộ MIC — không vào "sàn giữ", không vào phần của chủ xe.
    expect(r.platformRetainedAmount).toBe('460000');
    expect(r.ownerPayableAmount).toBe('880000');
    expect(r.ownerNetAmount).toBe('4590000');
  });

  it('tích cả hai gói ô tô ⇒ + 50.000 và + 20.000 mỗi ngày', () => {
    const r = fees({ vehicleProtectionSelected: true, personalAccidentSelected: true });
    expect(amountOf(r, FEE_LINE.TRIP_INSURANCE)).toBe(100000);
    expect(r.customerFeeTotal).toBe('400000');
    expect(r.customerTotalAmount).toBe('5400000');
    expect(r.onlineAmount).toBe('1620000');
    expect(r.payAtPickupAmount).toBe('3780000');
    expect(r.ownerNetAmount).toBe('4590000');
  });

  it('xe máy: phí sàn 30.000, bảo hiểm 15.000 + 5.000 mỗi ngày', () => {
    // 3 ngày × 150.000. H = 15.000 + 15.000 + 10.500 = 40.500 ⇒ 41.000.
    const r = fees({
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '450000',
      rentalDays: 3,
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(amountOf(r, FEE_LINE.SERVICE_FEE)).toBe(30000);
    expect(amountOf(r, FEE_LINE.VEHICLE_PROTECTION)).toBe(45000);
    expect(amountOf(r, FEE_LINE.TRIP_INSURANCE)).toBe(15000);
    expect(r.ownerCommissionAmount).toBe('41000');
    expect(r.customerTotalAmount).toBe('540000');
    expect(r.onlineAmount).toBe('162000');
    expect(r.payAtPickupAmount).toBe('378000');
    expect(r.ownerPayableAmount).toBe('31000');
    expect(r.ownerNetAmount).toBe('409000');
  });

  it('khách KHÔNG tích ⇒ không có dòng bảo hiểm, không thu đồng nào', () => {
    const r = fees();
    expect(lineOf(r, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
    expect(lineOf(r, FEE_LINE.TRIP_INSURANCE)).toBeUndefined();
  });

  it('cổng TẮT ở chính sách thì khách có tích cũng không thu — cổng thắng lựa chọn', () => {
    const r = fees({
      policy: { ...PILOT, vehicleProtectionEnabled: false, tripInsuranceEnabled: false },
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(r.customerTotalAmount).toBe('5050000');
    expect(lineOf(r, FEE_LINE.VEHICLE_PROTECTION)).toBeUndefined();
    expect(lineOf(r, FEE_LINE.TRIP_INSURANCE)).toBeUndefined();
  });
});

describe('computeCustomerFees — sàn và trần của cọc online', () => {
  it('30% nhỏ hơn phần phải giữ lại ⇒ cọc nâng lên đủ, ví chủ xe không bao giờ nhận số âm', () => {
    /*
     * Xe máy 1 ngày 100.000đ, tích cả hai gói: 30% × 150.000 = 45.000 (sàn cọc 50.000) nhưng XePrime
     * phải giữ 30.000 phí sàn + 10.000 hoa hồng + 20.000 bảo hiểm = 60.000.
     */
    const r = fees({
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '100000',
      rentalDays: 1,
      vehicleProtectionSelected: true,
      personalAccidentSelected: true,
    });
    expect(r.onlineAmount).toBe('60000');
    expect(r.depositAmount).toBe('0');
    expect(r.ownerPayableAmount).toBe('0');
    expect(r.payAtPickupAmount).toBe('90000');
    expect(r.ownerNetAmount).toBe('90000');
  });

  it('sàn cọc (depositMinAmount) thắng 30% khi 30% quá nhỏ', () => {
    // Xe máy tuyến gói 1 ngày 100.000: 30% × 130.000 = 39.000 < sàn 50.000.
    const r = fees({
      billingMode: BILLING_MODE.PACKAGE,
      depositRequired: true,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '100000',
      rentalDays: 1,
    });
    expect(r.onlineAmount).toBe('50000');
    expect(r.depositAmount).toBe('20000');
    expect(r.payAtPickupAmount).toBe('80000');
  });

  it('sàn lớn hơn cả chuyến ⇒ kẹp về tổng khách trả, KHÔNG bao giờ sinh số trả tay âm', () => {
    const r = fees({
      policy: { ...PILOT, depositMinAmount: '500000' },
      billingMode: BILLING_MODE.PACKAGE,
      depositRequired: true,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      baseAmount: '100000',
      rentalDays: 1,
    });
    expect(r.onlineAmount).toBe('130000');
    expect(r.payAtPickupAmount).toBe('0');
    expect(r.depositAmount).toBe('100000');
  });

  it('% làm tròn 1.000đ — không xuất hiện số lẻ kiểu 100.200đ hay 100.500đ', () => {
    // H = 123.400 ⇒ 123.000; 30% × 1.284.000 = 385.200 ⇒ 385.000.
    const r = fees({ baseAmount: '1234000', rentalDays: 2 });
    expect(r.ownerCommissionAmount).toBe('123000');
    expect(r.onlineAmount).toBe('385000');
    expect(r.payAtPickupAmount).toBe('899000');
    expect(r.ownerPayableAmount).toBe('212000');
  });
});

describe('computeCustomerFees — thuế nằm phía CHỦ XE', () => {
  const taxed: FeePolicySnapshot = {
    ...PILOT,
    taxEnabled: true,
    taxPercent: 7,
    taxLabel: 'VAT + TNCN',
  };

  it('không vào tổng khách; trừ vào phần sàn chuyển ví và vào số chủ xe nhận', () => {
    const r = fees({ policy: taxed });
    const tax = lineOf(r, FEE_LINE.TAX)!;
    expect(tax.bearer).toBe(FEE_BEARER.OWNER);
    expect(tax.percent).toBe(7);
    expect(r.taxAmount).toBe('350000');
    expect(r.customerTotalAmount).toBe('5050000');
    expect(r.payAtPickupAmount).toBe('3535000');
    expect(r.ownerPayableAmount).toBe('705000'); // 1.055.000 − 350.000
    expect(r.ownerNetAmount).toBe('4240000'); // 5.000.000 − 410.000 − 350.000
  });

  it('thuế cũng theo bước giá 1.000đ', () => {
    // 7% × 1.234.000 = 86.380 ⇒ 86.000.
    expect(fees({ policy: taxed, baseAmount: '1234000', rentalDays: 2 }).taxAmount).toBe('86000');
  });
});

describe('computeCustomerFees — báo giá TẠM TÍNH và đầu vào rác', () => {
  it('tạm tính ⇒ vẫn hiện phí dự kiến nhưng KHÔNG thu online (không lấy % trên số chưa chốt)', () => {
    const r = fees({ quoteIsEstimate: true });
    expect(amountOf(r, FEE_LINE.SERVICE_FEE)).toBe(50000);
    expect(r.ownerCommissionAmount).toBe('410000');
    expect(r.depositAmount).toBe('0');
    expect(r.onlineAmount).toBe('0');
    expect(r.sponsorableAmount).toBe('0');
    expect(r.holdAmount).toBeNull();
  });

  it('đầu vào rác thì ném — không im lặng cho ra 0', () => {
    expect(() => fees({ baseAmount: 'abc' })).toThrow();
    expect(() => fees({ rentalDays: 0 })).toThrow();
    expect(() => fees({ rentalDays: 1.5 })).toThrow();
    expect(() => fees({ dayAmounts: ['1000000', '1000000'] })).toThrow();
  });

  it('loại xe lạ hoặc chính sách thiếu số của một loại xe ⇒ ném, không thu 0đ âm thầm', () => {
    // `vehicleType` thường là một cột chuỗi của DB được ép kiểu — kiểm lúc chạy, không chỉ lúc biên dịch.
    expect(() => fees({ vehicleType: 'truck' as never })).toThrow();
    const missing = {
      [VEHICLE_TYPE.CAR]: '50000',
    } as unknown as FeePolicySnapshot['customerPlatformFee'];
    expect(() =>
      fees({
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        policy: { ...PILOT, customerPlatformFee: missing },
      }),
    ).toThrow();
  });
});

describe('computeCustomerFees — BẤT BIẾN trên một lưới đầu vào', () => {
  /**
   * Bảo đảm "không bao giờ lệch 1.000đ" của bản thiết kế không nằm ở vài ví dụ đẹp: quét mọi tổ
   * hợp loại xe × tuyến × số ngày × giá × bảo hiểm × cọc × thuế và đòi các đẳng thức ở mọi ô.
   */
  it('ba đẳng thức bảo toàn, bước 1.000đ và không số âm ở mọi tổ hợp', () => {
    const violations: string[] = [];
    const taxed: FeePolicySnapshot = { ...PILOT, taxEnabled: true, taxPercent: 7, taxLabel: 'T' };
    const tracks = [
      { billingMode: BILLING_MODE.COMMISSION, depositRequired: true },
      { billingMode: BILLING_MODE.PACKAGE, depositRequired: true },
      { billingMode: BILLING_MODE.PACKAGE, depositRequired: false },
    ];
    for (const vehicleType of VEHICLE_TYPE_VALUES)
      for (const track of tracks)
        for (const rentalDays of [1, 2, 3, 7, 8, 30, 31, 45])
          for (const dailyPrice of [80_000, 150_000, 333_000, 1_000_000, 2_500_000])
            for (const [vehicleProtectionSelected, personalAccidentSelected] of [
              [false, false],
              [true, false],
              [false, true],
              [true, true],
            ] as const)
              for (const policy of [PILOT, taxed])
                for (const delivery of [0, 150_000]) {
                  const r = fees({
                    ...track,
                    policy,
                    vehicleType,
                    rentalDays,
                    baseAmount: String(dailyPrice * rentalDays + delivery),
                    deliveryAmount: String(delivery),
                    vehicleProtectionSelected,
                    personalAccidentSelected,
                  });
                  const n = (v: string) => Number(v);
                  const insurance =
                    amountOf(r, FEE_LINE.VEHICLE_PROTECTION) + amountOf(r, FEE_LINE.TRIP_INSURANCE);
                  const checks: Record<string, boolean> = {
                    onlinePlusPickupIsTotal:
                      n(r.onlineAmount) + n(r.payAtPickupAmount) === n(r.customerTotalAmount),
                    grossOnlineIsSumOfLines:
                      n(r.grossOnlineAmount) ===
                      n(r.depositAmount) + n(r.platformRetainedAmount) + insurance,
                    pickupPlusPayableIsOwnerNetPlusDelivery:
                      n(r.payAtPickupAmount) + n(r.ownerPayableAmount) ===
                      n(r.ownerNetAmount) + delivery,
                    ownerNetIsRentMinusDeductions:
                      n(r.ownerNetAmount) ===
                      n(r.baseAmount) - delivery - n(r.ownerCommissionAmount) - n(r.taxAmount),
                    taxableBaseIsRent: n(r.taxableBaseAmount!) === n(r.baseAmount) - delivery,
                    thousandStep: [
                      r.customerTotalAmount,
                      r.onlineAmount,
                      r.payAtPickupAmount,
                      r.depositAmount,
                      r.ownerCommissionAmount,
                      r.ownerPayableAmount,
                      r.ownerNetAmount,
                      r.taxAmount,
                      ...r.lines.map((l) => l.amount),
                    ].every((v) => n(v) % 1000 === 0),
                    nonNegative: [r.depositAmount, r.ownerPayableAmount, r.payAtPickupAmount].every(
                      (v) => n(v) >= 0,
                    ),
                    collectsOnline: r.holdAmount === r.onlineAmount,
                    // Phí giao luôn rơi trọn vào phần trả tay — không bao giờ vào mã QR.
                    deliveryAtPickup: n(r.payAtPickupAmount) >= delivery,
                    // Thuế tính trên TIỀN THUÊ, không trên phí giao (ADR 0064).
                    taxOnRentOnly:
                      !policy.taxEnabled ||
                      n(r.taxAmount) === roundToThousand((dailyPrice * rentalDays * 7) / 100),
                  };
                  const failed = Object.keys(checks).filter((k) => !checks[k]);
                  if (failed.length) {
                    violations.push(
                      `${vehicleType}/${track.billingMode}/${track.depositRequired}/${rentalDays}d/` +
                        `${dailyPrice}/${vehicleProtectionSelected}/${personalAccidentSelected}/` +
                        `${policy.taxEnabled}/${delivery}: ${failed.join(',')}`,
                    );
                  }
                }
    expect(violations).toEqual([]);
  });
});

describe('resolveHoldAllocation — luồng tiền v2', () => {
  const sum = (entries: ReturnType<typeof resolveHoldAllocation>) =>
    entries.reduce((t, e) => t + Number(e.amount), 0);

  it('chuyến hoàn thành: chủ xe nhận 1.055.000, sàn giữ 460.000 (phí sàn + hoa hồng)', () => {
    const totals = allocationTotals(resolveHoldAllocation(holdLinesOf(fees()), 'settled'));
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('1055000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('460000');
    expect(totals[ALLOCATION_TARGET.CUSTOMER_BALANCE]).toBe('0');
  });

  it('phí sàn và hoa hồng là HAI dòng doanh thu, báo cáo tách được', () => {
    const out = resolveHoldAllocation(holdLinesOf(fees()), 'settled');
    const platform = out.filter((e) => e.target === ALLOCATION_TARGET.PLATFORM_REVENUE);
    expect(platform).toEqual([
      { key: FEE_LINE.SERVICE_FEE, target: ALLOCATION_TARGET.PLATFORM_REVENUE, amount: '50000' },
      {
        key: FEE_LINE.OWNER_COMMISSION,
        target: ALLOCATION_TARGET.PLATFORM_REVENUE,
        amount: '410000',
      },
    ]);
  });

  it('có bảo hiểm MIC: 250.000 thành khoản phải trả hãng bảo hiểm, chủ xe nhận 880.000', () => {
    const r = fees({ vehicleProtectionSelected: true });
    const totals = allocationTotals(resolveHoldAllocation(holdLinesOf(r), 'settled'));
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('880000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('460000');
    expect(totals[ALLOCATION_TARGET.INSURER_PAYABLE]).toBe('250000');
  });

  it('huỷ trong cửa sổ miễn phí / chủ xe huỷ: hoàn 100% cọc về ví khách', () => {
    const out = resolveHoldAllocation(holdLinesOf(fees()), 'refund_all');
    expect(out.every((e) => e.target === ALLOCATION_TARGET.CUSTOMER_BALANCE)).toBe(true);
    expect(sum(out)).toBe(1515000);
  });

  it('huỷ muộn / no-show: cọc chia đôi, nửa chủ xe làm tròn XUỐNG 1.000đ, phần dư về sàn', () => {
    // 1.515.000 / 2 = 757.500 ⇒ chủ xe 757.000, sàn 758.000.
    const totals = allocationTotals(
      resolveHoldAllocation(holdLinesOf(fees()), 'split_late_cancel'),
    );
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('757000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('758000');
    expect(totals[ALLOCATION_TARGET.CUSTOMER_BALANCE]).toBe('0');
  });

  it('huỷ muộn có bảo hiểm: bảo hiểm hoàn đủ (chưa phát hành), phần còn lại chia đôi', () => {
    const r = fees({ vehicleProtectionSelected: true });
    const totals = allocationTotals(resolveHoldAllocation(holdLinesOf(r), 'split_late_cancel'));
    expect(totals[ALLOCATION_TARGET.CUSTOMER_BALANCE]).toBe('250000');
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('670000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('670000');
  });

  it('hoàn có tài trợ: trừ theo thứ tự CỌC → HOA HỒNG → PHÍ SÀN, không bao giờ vào bảo hiểm', () => {
    const lines: HoldMoneyLines = {
      deposit: '100000',
      serviceFee: '50000',
      ownerCommission: '60000',
      vehicleInsurance: '30000',
      personalInsurance: '0',
      promoDiscount: '130000',
    };
    const out = resolveHoldAllocation(lines, 'refund_all');
    const byKey = (key: FeeLineKey) =>
      out.filter((l) => l.key === key).reduce((s, l) => s + Number(l.amount), 0);
    expect(byKey(FEE_LINE.DEPOSIT)).toBe(0);
    expect(byKey(FEE_LINE.OWNER_COMMISSION)).toBe(30000);
    expect(byKey(FEE_LINE.SERVICE_FEE)).toBe(50000);
    expect(byKey(FEE_LINE.VEHICLE_PROTECTION)).toBe(30000);
    expect(sum(out)).toBe(100000 + 50000 + 60000 + 30000 - 130000);
  });

  it('BẤT BIẾN: tổng phân bổ = tiền mặt hold đã nhận ở MỌI nhánh, có hoa hồng, thuế và tài trợ', () => {
    const taxed: FeePolicySnapshot = { ...PILOT, taxEnabled: true, taxPercent: 7, taxLabel: 'T' };
    const variants = [
      fees(),
      fees({ vehicleProtectionSelected: true, personalAccidentSelected: true }),
      fees({ policy: taxed }),
      fees({ billingMode: BILLING_MODE.PACKAGE, depositRequired: false }),
      fees({ vehicleType: VEHICLE_TYPE.MOTORBIKE, baseAmount: '450000', rentalDays: 3 }),
    ];
    for (const r of variants) {
      const lines = { ...holdLinesOf(r), promoDiscount: '40000' };
      const cash = Number(r.grossOnlineAmount) - 40000;
      for (const kind of ['refund_all', 'split_late_cancel', 'settled'] as const) {
        const out = resolveHoldAllocation(lines, kind, r.taxAmount);
        const totals = allocationTotals(out);
        expect({ kind, sum: sum(out) }).toEqual({ kind, sum: cash });
        expect(Object.values(totals).reduce((t, v) => t + Number(v), 0)).toBe(cash);
      }
    }
  });
});

describe('resolveHoldAllocation — hold đời cũ (bốn dòng, không hoa hồng)', () => {
  const lines = {
    deposit: '140000',
    serviceFee: '70000',
    vehicleInsurance: '130000',
    personalInsurance: '0',
  };
  const sum = (entries: ReturnType<typeof resolveHoldAllocation>) =>
    entries.reduce((t, e) => t + Number(e.amount), 0);

  it('huỷ sớm: hoàn TẤT CẢ về ví khách, không sót đồng nào', () => {
    const out = resolveHoldAllocation(lines, 'refund_all');
    expect(out.every((e) => e.target === ALLOCATION_TARGET.CUSTOMER_BALANCE)).toBe(true);
    expect(sum(out)).toBe(340000);
  });

  it('huỷ muộn: D+S chia đôi, IV+IP hoàn 100% — tổng vẫn đúng bằng số đã thu', () => {
    const totals = allocationTotals(resolveHoldAllocation(lines, 'split_late_cancel'));
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('105000'); // (140.000 + 70.000) / 2
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('105000');
    expect(totals[ALLOCATION_TARGET.CUSTOMER_BALANCE]).toBe('130000'); // bảo hiểm chưa mua ⇒ hoàn đủ
  });

  it('chia đôi số LẺ: phần dư về nền tảng, tổng không được lệch một đồng', () => {
    const odd = { ...lines, deposit: '100001', serviceFee: '0', vehicleInsurance: '0' };
    const totals = allocationTotals(resolveHoldAllocation(odd, 'split_late_cancel'));
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('50000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('50001');
  });

  it('chuyến hoàn thành: chủ xe nhận D−T, XePrime ghi nhận S, bảo hiểm thành khoản phải trả', () => {
    const totals = allocationTotals(resolveHoldAllocation(lines, 'settled', '49000'));
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('91000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('70000');
    expect(totals[ALLOCATION_TARGET.INSURER_PAYABLE]).toBe('130000');
    // Thuế có ĐÍCH RIÊNG, không tan biến khỏi phân bổ (14/09/2026).
    expect(totals[ALLOCATION_TARGET.TAX_LEDGER]).toBe('49000');
  });

  /**
   * BẤT BIẾN NỀN của đối soát ba vế: **tổng phân bổ luôn bằng số tiền đã nhận**.
   *
   * Trước 14/09/2026 nhánh `settled` có thuế làm vỡ bất biến này — phần `T` bị trừ khỏi dòng về
   * ví chủ xe rồi không được đẩy đi đâu, nên `Σ allocation = amount − T`. Test này khoá cả bốn
   * nhánh, gồm ca thuế bật.
   */
  it('BẤT BIẾN: tổng phân bổ = D + S + IV + IP ở MỌI nhánh, kể cả khi bật thuế', () => {
    const cases: Array<[Parameters<typeof resolveHoldAllocation>[1], string]> = [
      ['refund_all', '0'],
      ['split_late_cancel', '0'],
      ['settled', '0'],
      ['settled', '49000'],
    ];
    for (const [kind, tax] of cases) {
      const out = resolveHoldAllocation(lines, kind, tax);
      expect({ kind, tax, sum: sum(out) }).toEqual({ kind, tax, sum: 340000 });
      const totals = allocationTotals(out);
      expect(Object.values(totals).reduce((t, v) => t + Number(v), 0)).toBe(340000);
    }
  });

  it('thuế lớn hơn cọc bị KẸP — bất biến không được phụ thuộc CHECK của bảng khác', () => {
    const out = resolveHoldAllocation(
      { deposit: '100000', serviceFee: '0', vehicleInsurance: '0', personalInsurance: '0' },
      'settled',
      '150000',
    );
    expect(Number(allocationTotals(out)[ALLOCATION_TARGET.TAX_LEDGER])).toBe(100000);
    expect(Number(allocationTotals(out)[ALLOCATION_TARGET.OWNER_BALANCE])).toBe(0);
    expect(sum(out)).toBe(100000);
  });

  it('không bao giờ sinh dòng 0đ — sổ cái không chứa bút toán rỗng', () => {
    const out = resolveHoldAllocation(
      { deposit: '100000', serviceFee: '0', vehicleInsurance: '0', personalInsurance: '0' },
      'refund_all',
    );
    expect(out).toHaveLength(1);
  });
});

describe('feePolicyActivationBlockers — ADR 0028 điều 4–5, ADR 0033, luồng tiền v2', () => {
  it('bộ số mặc định của luồng tiền v2 (kèm đối tác MIC) kích hoạt được', () => {
    expect(feePolicyActivationBlockers(PILOT)).toEqual([]);
  });

  it('bật thuế mà không có tỷ lệ + tên loại thuế ⇒ chặn', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, taxEnabled: true })).toContain(
      'tax_requires_rate_and_label',
    );
  });

  it('bật bảo hiểm mà chưa có ĐỐI TÁC THẬT ⇒ chặn (không dùng tên đối tác trước hợp đồng)', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, insurancePartnerName: null })).toContain(
      'insurance_requires_partner',
    );
  });

  it('cổng bảo hiểm mở mà MỘT loại xe thiếu biểu phí ngày ⇒ chặn', () => {
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        vehicleProtectionDailyAmount: {
          [VEHICLE_TYPE.CAR]: '50000',
          [VEHICLE_TYPE.MOTORBIKE]: '0',
        },
      }),
    ).toContain('vehicle_protection_requires_rate');
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        tripInsuranceDailyAmount: { [VEHICLE_TYPE.CAR]: '0', [VEHICLE_TYPE.MOTORBIKE]: '5000' },
      }),
    ).toContain('trip_insurance_requires_rate');
  });

  it('cổng bảo hiểm ĐÓNG thì biểu phí 0đ không chặn', () => {
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        vehicleProtectionEnabled: false,
        tripInsuranceEnabled: false,
        insurancePartnerName: null,
        vehicleProtectionDailyAmount: { [VEHICLE_TYPE.CAR]: '0', [VEHICLE_TYPE.MOTORBIKE]: '0' },
        tripInsuranceDailyAmount: { [VEHICLE_TYPE.CAR]: '0', [VEHICLE_TYPE.MOTORBIKE]: '0' },
      }),
    ).toEqual([]);
  });

  it('số tiền cấu hình không phải bội 1.000đ (hoặc âm) ⇒ chặn', () => {
    const odd = [
      { customerPlatformFee: { [VEHICLE_TYPE.CAR]: '50500', [VEHICLE_TYPE.MOTORBIKE]: '30000' } },
      { customerPlatformFee: { [VEHICLE_TYPE.CAR]: '-1000', [VEHICLE_TYPE.MOTORBIKE]: '30000' } },
      {
        tripInsuranceDailyAmount: { [VEHICLE_TYPE.CAR]: '20000', [VEHICLE_TYPE.MOTORBIKE]: '5500' },
      },
      { holdMinAmount: '20500' },
      { depositMinAmount: '49999' },
    ];
    for (const over of odd) {
      expect(feePolicyActivationBlockers({ ...PILOT, ...over })).toContain(
        'amount_not_thousand_step',
      );
    }
  });

  it('nấc hoa hồng sai cấu trúc ⇒ chặn', () => {
    const broken = [
      [],
      [{ fromDay: 2, percent: 10 }],
      [
        { fromDay: 1, percent: 10 },
        { fromDay: 3, percent: 7 },
        { fromDay: 3, percent: 3 },
      ],
      [
        { fromDay: 1, percent: 10 },
        { fromDay: 2.5, percent: 7 },
      ],
      [{ fromDay: 1, percent: 31 }],
      [{ fromDay: 1, percent: -1 }],
    ];
    for (const ownerCommissionTiers of broken) {
      expect(feePolicyActivationBlockers({ ...PILOT, ownerCommissionTiers })).toContain(
        'owner_commission_tiers_invalid',
      );
    }
  });

  it('% phí dịch vụ cũ ngoài biên ⇒ vẫn chặn cho tới khi cột đó được gỡ', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, serviceFeePercent: 31 })).toContain(
      'service_fee_out_of_range',
    );
  });

  it('cọc vượt trần của chính sách ⇒ chặn (cọc không được thành thu tiền thuê trước)', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, depositPercent: 60 })).toContain(
      'deposit_percent_out_of_range',
    );
  });

  it('cọc THẤP HƠN thuế ⇒ chặn: "cọc 30%" công bố sẽ không đúng ở đơn nào', () => {
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        depositPercent: 5,
        taxEnabled: true,
        taxPercent: 7,
        taxLabel: 'VAT + TNCN',
      }),
    ).toContain('deposit_percent_below_tax_percent');
  });

  it('cửa sổ huỷ miễn phí ngắn hơn cửa sổ trả tiền ⇒ chặn', () => {
    expect(
      feePolicyActivationBlockers({ ...PILOT, freeCancelHours: 1, holdPaymentWindowMinutes: 120 }),
    ).toContain('free_cancel_shorter_than_payment_window');
  });

  /**
   * Cửa sổ NGẮN HƠN ngưỡng dùng được ⇒ chặn ngay ở cổng kích hoạt.
   *
   * `createForApprovedRequestWithinTx` từ chối mọi hold còn ít hơn `HOLD_MIN_USABLE_WINDOW_MINUTES`
   * phút, và `expiresAt − now` không bao giờ vượt quá cửa sổ của chính sách. Một chính sách dưới
   * ngưỡng vì thế không phát nổi một mã QR nào — cả sàn ngừng nhận đơn, im lặng. Ca này là cái
   * chặn để hai hằng số không trôi khỏi nhau.
   */
  it('cửa sổ trả tiền ngắn hơn ngưỡng dùng được ⇒ chặn', () => {
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        holdPaymentWindowMinutes: HOLD_MIN_USABLE_WINDOW_MINUTES - 1,
      }),
    ).toContain('hold_window_out_of_range');
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        holdPaymentWindowMinutes: HOLD_MIN_USABLE_WINDOW_MINUTES,
      }),
    ).not.toContain('hold_window_out_of_range');
  });
});

describe('customerHoldAllocation — khoản giữ chỗ như khách thấy (ADR 0064 điều 11)', () => {
  /** Hình dạng `allocation_json` thật: D 1.055.000 · H 410.000 · S 50.000 · IV 250.000 · P 30.000. */
  const lines = [
    { key: FEE_LINE.DEPOSIT, beneficiary: 'owner', bearer: 'customer', amount: '1055000' },
    { key: FEE_LINE.OWNER_COMMISSION, beneficiary: 'platform', bearer: 'owner', amount: '410000' },
    { key: FEE_LINE.PROMO, beneficiary: 'platform', bearer: 'customer', amount: '30000' },
    { key: FEE_LINE.SERVICE_FEE, beneficiary: 'platform', bearer: 'customer', amount: '50000' },
    { key: FEE_LINE.VEHICLE_PROTECTION, beneficiary: 'insurer', bearer: 'customer', amount: '250000' },
  ];
  const amount = 1055000 + 410000 + 50000 + 250000 - 30000;

  it('gộp D + H thành MỘT dòng; không dòng nào mang riêng D hay H', () => {
    const shown = customerHoldAllocation(lines);
    expect(shown.map((l) => l.key)).toEqual([
      FEE_LINE.RENT_PREPAID,
      FEE_LINE.PROMO,
      FEE_LINE.SERVICE_FEE,
      FEE_LINE.VEHICLE_PROTECTION,
    ]);
    expect(shown[0]!.amount).toBe('1465000');
    expect(shown.some((l) => l.amount === '1055000' || l.amount === '410000')).toBe(false);
  });

  it('các dòng vẫn cộng đúng bằng số khách chuyển (PROMO là dòng trừ)', () => {
    const sum = customerHoldAllocation(lines).reduce(
      (s, l) => s + (l.key === FEE_LINE.PROMO ? -1 : 1) * Number(l.amount),
      0,
    );
    expect(sum).toBe(amount);
  });

  it('dòng phía chủ xe khác (bearer = owner) không lọt; danh sách rỗng/null ⇒ rỗng', () => {
    expect(
      customerHoldAllocation([
        { key: FEE_LINE.TAX, beneficiary: 'tax_authority', bearer: 'owner', amount: '1000' },
      ]),
    ).toEqual([]);
    expect(customerHoldAllocation(null)).toEqual([]);
  });
});
