import { describe, expect, it } from 'vitest';
import {
  computeCustomerFees,
  FEE_LINE,
  resolveHoldAllocation,
  ALLOCATION_TARGET,
  allocationTotals,
  type FeePolicySnapshot,
} from './fee-policy';
import {
  computePromoDiscount,
  normalizePromoCode,
  PROMO_AUDIENCE,
  PROMO_CODE_STATE,
  PROMO_DISCOUNT_TYPE,
  PROMO_INELIGIBLE_REASON,
  PROMO_VEHICLE_SCOPE,
  promoCodeConfigBlockers,
  promoCodeState,
  promoEligibleAmount,
  promoScopeMismatch,
  type PromoCodeSnapshot,
  type PromoCodeTerms,
} from './promo-code';
import { BILLING_MODE } from './status/billing';
import { PRICE_ROW } from './pricing';
import { SERVICE_TYPE, VEHICLE_TYPE } from './status/vehicle';

/**
 * MÃ KHUYẾN MÃI NỀN TẢNG — phép tính THUẦN (ADR 0046).
 *
 * Spec này khoá bốn thứ mà cả web, mobile, api và worker đều đọc lại từ cùng một hàm:
 *
 *  1. **Công thức và bốn cái trần** — mã cố định, mã phần trăm, và ba trần kẹp chúng.
 *  2. **Cộng dồn với khuyến mãi TRỰC TIẾP của xe** — mã tính trên tiền thuê SAU khi chủ xe bớt.
 *  3. **Bất biến tiền**: `B`, `S`, `T`, `IV`, `IP`, `D`, `payAtPickup`, `ownerPayable`,
 *     `ownerNet` KHÔNG đổi một đồng khi có mã; chỉ `onlineAmount` và `customerTotalAmount` giảm.
 *  4. **Phân bổ khi chốt kết cục** — nền tảng gánh tài trợ ở cả ba kết cục, và khách chỉ được
 *     hoàn đúng số tiền họ đã chuyển.
 */

/** Chính sách phí của mọi ca dưới đây — cùng bộ số với bản `active` ở môi trường dev. */
const POLICY: FeePolicySnapshot = {
  policyId: '01PROMOTESTPOLICY00000001',
  version: 1,
  serviceFeePercent: 10,
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 120,
  freeCancelHours: 4,
  depositPercent: 20,
  depositMinAmount: '50000',
  depositMaxPercent: 30,
  taxEnabled: false,
  taxPercent: null,
  taxLabel: null,
  tripInsuranceEnabled: false,
  tripInsurancePercent: null,
  vehicleProtectionEnabled: false,
  vehicleProtectionPercent: null,
  insurancePartnerName: null,
};

const ALL_SCOPE: Pick<
  PromoCodeTerms,
  'audience' | 'vehicleScope' | 'serviceScope' | 'provinceCodes' | 'perCustomerLimit'
> = {
  audience: PROMO_AUDIENCE.ALL,
  vehicleScope: PROMO_VEHICLE_SCOPE.ALL,
  serviceScope: [],
  provinceCodes: [],
  perCustomerLimit: null,
};

function fixedTerms(amount: string, minOrder = '0'): PromoCodeTerms {
  return {
    ...ALL_SCOPE,
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: amount,
    discountPercent: null,
    maxDiscountAmount: null,
    minOrderAmount: minOrder,
  };
}

function percentTerms(percent: number, cap: string | null, minOrder = '0'): PromoCodeTerms {
  return {
    ...ALL_SCOPE,
    discountType: PROMO_DISCOUNT_TYPE.PERCENT,
    discountAmount: null,
    discountPercent: percent,
    maxDiscountAmount: cap,
    minOrderAmount: minOrder,
  };
}

function snapshotOf(terms: PromoCodeTerms, applied: string): PromoCodeSnapshot {
  return {
    ...terms,
    promoCodeId: '01PROMOTESTCODE000000001',
    code: 'BANMOI',
    name: 'Ưu đãi khách hàng mới',
    discountApplied: applied,
    appliedAt: new Date().toISOString(),
  };
}

/** Bốn con số tiền của một chuyến 1.400.000đ trên chính sách ở trên — dùng lại ở mọi ca. */
const TRIP = {
  eligibleAmount: '1400000',
  /** D(280.000) + S(140.000) */
  grossOnlineAmount: '420000',
  sponsorableAmount: '420000',
  holdMinAmount: '20000',
};

describe('normalizePromoCode', () => {
  it('in hoa, bỏ khoảng trắng hai đầu VÀ bên trong', () => {
    // Khách dán mã từ tin nhắn thường kéo theo khoảng trắng ở giữa — bỏ nó ở đây, không để
    // pattern từ chối một thứ mà người dùng không nhìn thấy.
    expect(normalizePromoCode('  ban moi ')).toBe('BANMOI');
    expect(normalizePromoCode('banmoi')).toBe('BANMOI');
    expect(normalizePromoCode('BANMOI')).toBe('BANMOI');
  });
});

describe('promoEligibleAmount — tiền thuê ĐỦ ĐIỀU KIỆN', () => {
  it('trừ khuyến mãi trực tiếp của xe, KHÔNG gồm phí giao nhận và các dòng phát sinh sau', () => {
    const eligible = promoEligibleAmount([
      { key: PRICE_ROW.BASE, amount: '800000' },
      { key: PRICE_ROW.DISCOUNT, amount: '-80000' },
      { key: PRICE_ROW.SUBTOTAL, amount: '720000' },
      { key: PRICE_ROW.DELIVERY, amount: '50000' },
      { key: PRICE_ROW.OVERTIME, amount: '0' },
      { key: PRICE_ROW.EXTRAS, amount: '0' },
    ]);
    // 800.000 − 80.000 = 720.000. Phí giao nhận 50.000 KHÔNG được giảm: đó là công của người
    // mang xe tới, không phải tiền thuê (ADR 0046 điều 3).
    expect(eligible).toBe('720000');
  });

  it('không có dòng giảm ⇒ bằng chính tiền thuê gốc', () => {
    expect(promoEligibleAmount([{ key: PRICE_ROW.BASE, amount: '1400000' }])).toBe('1400000');
  });

  it('thuê dài hạn dùng CÙNG công thức — base − ưu đãi cam kết = giá gói sau ưu đãi', () => {
    // Không có nhánh riêng nào phải nhớ cho dài hạn (ADR 0011).
    expect(
      promoEligibleAmount([
        { key: PRICE_ROW.BASE, amount: '12000000' },
        { key: PRICE_ROW.DISCOUNT, amount: '-1200000' },
        { key: PRICE_ROW.SUBTOTAL, amount: '10800000' },
      ]),
    ).toBe('10800000');
  });
});

describe('computePromoDiscount — công thức và bốn cái trần', () => {
  it('mã TIỀN CỐ ĐỊNH giảm đúng mệnh giá khi còn dư trần', () => {
    const r = computePromoDiscount({ terms: fixedTerms('100000'), ...TRIP });
    expect(r).toEqual({ ok: true, discountAmount: '100000', clamped: false });
  });

  it('mã PHẦN TRĂM tính trên tiền thuê đủ điều kiện, làm tròn HALF_UP', () => {
    // 8% × 1.400.000 = 112.000 — dưới trần 400.000 nên không bị kẹp.
    const r = computePromoDiscount({ terms: percentTerms(8, null), ...TRIP });
    expect(r).toEqual({ ok: true, discountAmount: '112000', clamped: false });
  });

  it('mã PHẦN TRĂM bị TRẦN của chính nó kẹp, và nói rõ là đã kẹp', () => {
    // 8% của 1.400.000 là 112.000 nhưng mã chỉ giảm tối đa 80.000.
    const r = computePromoDiscount({ terms: percentTerms(8, '80000'), ...TRIP });
    expect(r).toEqual({ ok: true, discountAmount: '80000', clamped: true });
  });

  it('CHƯA ĐỦ ĐƠN TỐI THIỂU ⇒ từ chối, không giảm một phần', () => {
    const r = computePromoDiscount({
      terms: fixedTerms('100000', '2000000'),
      ...TRIP,
    });
    expect(r).toEqual({ ok: false, reason: PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET });
  });

  it('trần KHOẢN ONLINE: mã không bao giờ đưa tiền giữ chỗ xuống dưới sàn đối soát', () => {
    /*
     * Mã 10.000.000đ trên một chuyến có khoản online 420.000đ. Trần là
     * `grossOnline − holdMinAmount` = 400.000 — phát một mã QR 0đ là tạo một chuyến chiếm chỗ
     * hai giờ mà không ai phải chuyển đồng nào (ADR 0044 điều 4).
     */
    const r = computePromoDiscount({ terms: fixedTerms('10000000'), ...TRIP });
    expect(r).toEqual({ ok: true, discountAmount: '400000', clamped: true });
  });

  it('trần TIỀN THUÊ: không giảm nhiều hơn chính thứ đang được giảm', () => {
    // Chuyến 300.000đ: eligible = 300.000 là trần chặt hơn cả `grossOnline − sàn`.
    const r = computePromoDiscount({
      terms: fixedTerms('500000'),
      eligibleAmount: '300000',
      grossOnlineAmount: '900000',
      sponsorableAmount: '900000',
      holdMinAmount: '20000',
    });
    expect(r).toEqual({ ok: true, discountAmount: '300000', clamped: true });
  });

  it('trần TÀI TRỢ ĐƯỢC: mã KHÔNG lấn vào tiền giữ hộ hãng bảo hiểm', () => {
    /*
     * Chuyến có `D = 0`, `S = 0` (tuyến gói tắt cọc) nhưng vẫn thu 200.000đ bảo hiểm. Tài trợ ở
     * đó là XePrime thu thiếu tiền của đối tác bảo hiểm — nó vẫn phải chuyển đủ (ADR 0033 điều 4).
     */
    const r = computePromoDiscount({
      terms: fixedTerms('100000'),
      eligibleAmount: '1400000',
      grossOnlineAmount: '200000',
      sponsorableAmount: '0',
      holdMinAmount: '20000',
    });
    expect(r).toEqual({ ok: false, reason: PROMO_INELIGIBLE_REASON.DISCOUNT_BELOW_FLOOR });
  });

  it('chuyến KHÔNG thu tiền online (báo giá tạm tính, dài hạn chưa chốt lịch) ⇒ không áp được', () => {
    const r = computePromoDiscount({
      terms: fixedTerms('100000'),
      ...TRIP,
      grossOnlineAmount: null,
    });
    expect(r).toEqual({ ok: false, reason: PROMO_INELIGIBLE_REASON.NO_ONLINE_PAYMENT });
  });

  it('khoản online đúng bằng sàn ⇒ không còn chỗ tài trợ, trả DISCOUNT_BELOW_FLOOR', () => {
    const r = computePromoDiscount({
      terms: fixedTerms('100000'),
      eligibleAmount: '100000',
      grossOnlineAmount: '20000',
      sponsorableAmount: '20000',
      holdMinAmount: '20000',
    });
    expect(r).toEqual({ ok: false, reason: PROMO_INELIGIBLE_REASON.DISCOUNT_BELOW_FLOOR });
  });
});

describe('promoScopeMismatch — phạm vi không phụ thuộc tiền', () => {
  const trip = {
    vehicleType: VEHICLE_TYPE.CAR,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    provinceCode: '01',
  } as const;

  it('phạm vi "tất cả" không loại ai', () => {
    expect(promoScopeMismatch(ALL_SCOPE, trip)).toBeNull();
  });

  it('mã chỉ cho XE MÁY không áp cho ô tô', () => {
    expect(
      promoScopeMismatch({ ...ALL_SCOPE, vehicleScope: PROMO_VEHICLE_SCOPE.MOTORBIKE }, trip),
    ).toBe(PROMO_INELIGIBLE_REASON.VEHICLE_SCOPE_MISMATCH);
  });

  it('mã chỉ cho dịch vụ CÓ TÀI XẾ không áp cho tự lái', () => {
    expect(
      promoScopeMismatch({ ...ALL_SCOPE, serviceScope: [SERVICE_TYPE.WITH_DRIVER] }, trip),
    ).toBe(PROMO_INELIGIBLE_REASON.SERVICE_SCOPE_MISMATCH);
  });

  it('mảng dịch vụ RỖNG nghĩa là MỌI dịch vụ, không phải không dịch vụ nào', () => {
    expect(promoScopeMismatch({ ...ALL_SCOPE, serviceScope: [] }, trip)).toBeNull();
  });

  it('mã giới hạn khu vực loại chuyến ở tỉnh khác', () => {
    expect(promoScopeMismatch({ ...ALL_SCOPE, provinceCodes: ['79'] }, trip)).toBe(
      PROMO_INELIGIBLE_REASON.PROVINCE_MISMATCH,
    );
  });

  it('xe CHƯA có mã tỉnh không bị loại — mã khu vực nhắm một vùng, không phạt dữ liệu thiếu', () => {
    expect(
      promoScopeMismatch({ ...ALL_SCOPE, provinceCodes: ['79'] }, { ...trip, provinceCode: null }),
    ).toBeNull();
  });
});

describe('promoCodeState — trạng thái SUY RA, không phải cột', () => {
  const base = {
    isActive: true,
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    totalUsageLimit: 500,
    reservedCount: 0,
  };
  const now = new Date('2026-09-22T00:00:00.000Z');

  it('công tắc TẮT thắng mọi mốc thời gian', () => {
    expect(promoCodeState({ ...base, isActive: false }, now)).toBe(PROMO_CODE_STATE.DISABLED);
  });

  it('chưa tới ngày bắt đầu ⇒ sắp diễn ra', () => {
    expect(promoCodeState({ ...base, startsAt: '2026-10-01T00:00:00.000Z' }, now)).toBe(
      PROMO_CODE_STATE.UPCOMING,
    );
  });

  it('đã qua ngày kết thúc ⇒ hết hạn', () => {
    expect(promoCodeState({ ...base, endsAt: '2026-09-01T00:00:00.000Z' }, now)).toBe(
      PROMO_CODE_STATE.EXPIRED,
    );
  });

  it('HẾT LƯỢT thắng "sắp hết hạn" — bộ đếm là câu trả lời dứt khoát hơn', () => {
    expect(promoCodeState({ ...base, reservedCount: 500 }, now)).toBe(PROMO_CODE_STATE.EXHAUSTED);
  });

  it('còn 7 ngày hoặc ít hơn ⇒ sắp hết hạn', () => {
    expect(promoCodeState({ ...base, endsAt: '2026-09-27T00:00:00.000Z' }, now)).toBe(
      PROMO_CODE_STATE.ENDING_SOON,
    );
  });

  it('trần lượt NULL không bao giờ thành "hết lượt" dù đã dùng nhiều', () => {
    expect(
      promoCodeState({ ...base, totalUsageLimit: null, reservedCount: 9999 }, now),
    ).toBe(PROMO_CODE_STATE.ACTIVE);
  });
});

describe('promoCodeConfigBlockers — cấu hình admin', () => {
  const ok = {
    code: 'BANMOI',
    name: 'Ưu đãi khách hàng mới',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '100000',
    discountPercent: null,
    maxDiscountAmount: null,
    minOrderAmount: '800000',
    startsAt: '2026-09-22T00:00:00.000Z',
    endsAt: '2026-12-31T00:00:00.000Z',
    totalUsageLimit: 500,
    perCustomerLimit: 1,
  } as const;

  it('cấu hình hợp lệ không có blocker nào', () => {
    expect(promoCodeConfigBlockers({ ...ok })).toEqual([]);
  });

  it('mã sai định dạng (có gạch dưới, quá ngắn) bị chặn', () => {
    expect(promoCodeConfigBlockers({ ...ok, code: 'BAN_MOI' })).toContain('code_format');
    expect(promoCodeConfigBlockers({ ...ok, code: 'AB' })).toContain('code_format');
  });

  it('mã chữ thường VẪN hợp lệ — server chuẩn hoá trước khi kiểm', () => {
    expect(promoCodeConfigBlockers({ ...ok, code: 'banmoi' })).toEqual([]);
  });

  it('ngày kết thúc không sau ngày bắt đầu bị chặn', () => {
    expect(
      promoCodeConfigBlockers({ ...ok, endsAt: '2026-09-22T00:00:00.000Z' }),
    ).toContain('end_before_start');
  });

  it('mã TIỀN mang thêm trần giảm bị chặn — hai con số cùng nói về một giới hạn', () => {
    expect(promoCodeConfigBlockers({ ...ok, maxDiscountAmount: '80000' })).toContain(
      'max_discount_only_for_percent',
    );
  });

  it('mã PHẦN TRĂM thiếu tỷ lệ, hoặc tỷ lệ ngoài 1–100, bị chặn', () => {
    const asPercent = {
      ...ok,
      discountType: PROMO_DISCOUNT_TYPE.PERCENT,
      discountAmount: null,
    };
    expect(promoCodeConfigBlockers({ ...asPercent, discountPercent: null })).toContain(
      'percent_out_of_range',
    );
    expect(promoCodeConfigBlockers({ ...asPercent, discountPercent: 0 })).toContain(
      'percent_out_of_range',
    );
    expect(promoCodeConfigBlockers({ ...asPercent, discountPercent: 101 })).toContain(
      'percent_out_of_range',
    );
    expect(promoCodeConfigBlockers({ ...asPercent, discountPercent: 8 })).toEqual([]);
  });

  it('số tiền giảm vượt hàng rào chống gõ thừa số 0 bị chặn', () => {
    expect(promoCodeConfigBlockers({ ...ok, discountAmount: '100000000' })).toContain(
      'fixed_amount_out_of_range',
    );
  });
});

describe('computeCustomerFees + mã khuyến mãi — BẤT BIẾN TIỀN', () => {
  const feeInput = {
    billingMode: BILLING_MODE.COMMISSION,
    policy: POLICY,
    baseAmount: '1400000',
  } as const;

  it('KHÔNG có mã: grossOnline == online, và không có dòng promo nào', () => {
    const fees = computeCustomerFees(feeInput);
    expect(fees.grossOnlineAmount).toBe('420000');
    expect(fees.onlineAmount).toBe('420000');
    expect(fees.promoDiscountAmount).toBe('0');
    expect(fees.promo).toBeNull();
    expect(fees.customerTotalAmount).toBe('1540000');
  });

  it('CÓ mã: chỉ `onlineAmount` và `customerTotalAmount` giảm — mọi số khác GIỮ NGUYÊN', () => {
    const terms = fixedTerms('100000');
    const before = computeCustomerFees(feeInput);
    const after = computeCustomerFees({ ...feeInput, promo: snapshotOf(terms, '100000') });

    /*
     * Đây là bất biến trung tâm của ADR 0046: mã do XePrime tài trợ, nên không một con số nào
     * thuộc về gian hàng, ngân sách hay hãng bảo hiểm được đổi.
     */
    expect(after.baseAmount).toBe(before.baseAmount);
    expect(after.lines).toEqual(before.lines);
    expect(after.customerFeeTotal).toBe(before.customerFeeTotal);
    expect(after.depositAmount).toBe(before.depositAmount);
    expect(after.grossOnlineAmount).toBe(before.grossOnlineAmount);
    expect(after.payAtPickupAmount).toBe(before.payAtPickupAmount);
    expect(after.taxAmount).toBe(before.taxAmount);
    expect(after.ownerPayableAmount).toBe(before.ownerPayableAmount);
    expect(after.ownerNetAmount).toBe(before.ownerNetAmount);

    // Và đúng hai con số của KHÁCH giảm, đúng bằng phần tài trợ.
    expect(after.promoDiscountAmount).toBe('100000');
    expect(after.onlineAmount).toBe('320000');
    expect(after.holdAmount).toBe('320000');
    expect(after.customerTotalAmount).toBe('1440000');
    expect(Number(before.onlineAmount) - Number(after.onlineAmount)).toBe(100000);
    expect(Number(before.customerTotalAmount) - Number(after.customerTotalAmount)).toBe(100000);
  });

  it('KẸP LẠI một lần nữa ở máy giá: snapshot đòi nhiều hơn trần thì chỉ được tới trần', () => {
    /*
     * Bất biến "online không xuống dưới sàn" không được phép phụ thuộc vào việc mọi caller đều
     * nhớ kẹp. Đưa vào một snapshot đòi 10.000.000đ và kỳ vọng máy giá tự kẹp về 400.000đ.
     */
    const fees = computeCustomerFees({
      ...feeInput,
      promo: snapshotOf(fixedTerms('10000000'), '10000000'),
    });
    expect(fees.promoDiscountAmount).toBe('400000');
    expect(fees.onlineAmount).toBe('20000');
    expect(Number(fees.onlineAmount)).toBeGreaterThanOrEqual(Number(POLICY.holdMinAmount));
    // Snapshot đi kèm số ĐÃ KẸP, không phải số mã hứa — mọi màn hình đọc lại phải thấy số thật.
    expect(fees.promo?.discountApplied).toBe('400000');
  });

  it('snapshot có số giảm 0 ⇒ `promo` về null, không để một mã "giảm 0đ" đi tiếp', () => {
    const fees = computeCustomerFees({ ...feeInput, promo: snapshotOf(fixedTerms('0'), '0') });
    expect(fees.promo).toBeNull();
    expect(fees.promoDiscountAmount).toBe('0');
  });

  it('chuyến KHÔNG thu cọc: snapshot mã lọt vào cũng KHÔNG trừ được đồng nào', () => {
    /*
     * Tuyến gói tắt công tắc thu cọc: `D = 0`, `S = 0`, nên `holdAmount` là null — XePrime không
     * thu đồng nào của chuyến này. Một snapshot mã lọt vào đây phải bị vô hiệu hoá HOÀN TOÀN, nếu
     * không phần chênh rơi xuống tiền mặt chủ xe nhận tận tay (ADR 0046 điều 2).
     *
     * Tầng đánh giá đã chặn ca này; đây là lớp chặn thứ hai, ở chính máy giá.
     */
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      policy: POLICY,
      baseAmount: '1400000',
      depositRequired: false,
      promo: snapshotOf(fixedTerms('100000'), '100000'),
    });
    expect(fees.holdAmount).toBeNull();
    expect(fees.promoDiscountAmount).toBe('0');
    expect(fees.promo).toBeNull();
    // Số khách trả KHÔNG bị trừ, và tiền chủ xe nhận tận tay giữ nguyên.
    expect(fees.customerTotalAmount).toBe('1400000');
    expect(fees.payAtPickupAmount).toBe('1400000');
  });

  it('BÁO GIÁ TẠM TÍNH: không thu cọc ⇒ không có khoản giữ chỗ để tài trợ vào', () => {
    const fees = computeCustomerFees({
      ...feeInput,
      quoteIsEstimate: true,
      promo: snapshotOf(fixedTerms('100000'), '100000'),
    });
    // `holdAmount = null` là tín hiệu mà `promoContextFor` dùng để trả `NO_ONLINE_PAYMENT`.
    expect(fees.holdAmount).toBeNull();
    expect(fees.depositAmount).toBe('0');
  });

  it('cộng dồn với khuyến mãi TRỰC TIẾP của xe — mã tính trên tiền thuê SAU khi chủ xe bớt', () => {
    /*
     * Ảnh tham khảo của Mioto cộng dồn hai loại giảm, và ADR 0046 điều 3 chốt thứ tự: chủ xe bớt
     * trước, nền tảng tài trợ sau. Tính ngược lại (mã trên giá gốc) là nền tảng tài trợ cho cả
     * phần chủ xe đã bớt.
     *
     * Xe 800.000đ/ngày, giảm trực tiếp 10% ⇒ tiền thuê 720.000đ. Mã 10% ⇒ 72.000đ, không phải
     * 80.000đ.
     */
    const rows = [
      { key: PRICE_ROW.BASE, amount: '800000' },
      { key: PRICE_ROW.DISCOUNT, amount: '-80000' },
      { key: PRICE_ROW.SUBTOTAL, amount: '720000' },
    ];
    const eligible = promoEligibleAmount(rows);
    expect(eligible).toBe('720000');

    const feesNoPromo = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: POLICY,
      baseAmount: '720000',
    });
    const discount = computePromoDiscount({
      terms: percentTerms(10, null),
      eligibleAmount: eligible,
      grossOnlineAmount: feesNoPromo.grossOnlineAmount,
      sponsorableAmount: String(
        Number(feesNoPromo.depositAmount) +
          Number(feesNoPromo.lines.find((l) => l.key === FEE_LINE.SERVICE_FEE)?.amount ?? 0),
      ),
      holdMinAmount: POLICY.holdMinAmount,
    });
    expect(discount).toEqual({ ok: true, discountAmount: '72000', clamped: false });

    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: POLICY,
      baseAmount: '720000',
      promo: snapshotOf(percentTerms(10, null), '72000'),
    });
    // Doanh thu gian hàng vẫn là 720.000đ — mã không bớt thêm đồng nào của họ.
    expect(fees.baseAmount).toBe('720000');
    expect(fees.ownerNetAmount).toBe('720000');
    expect(fees.customerTotalAmount).toBe(String(720000 + 72000 - 72000));
  });

  it('tuyến GÓI (S = 0) vẫn tài trợ được — phần tài trợ lấy từ CỌC', () => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      policy: POLICY,
      baseAmount: '1400000',
      depositRequired: true,
      promo: snapshotOf(fixedTerms('100000'), '100000'),
    });
    // Không có dòng phí dịch vụ nào ở tuyến gói (ADR 0029 điều 2).
    expect(fees.lines).toEqual([]);
    // D = 280.000 ⇒ grossOnline = 280.000, online = 180.000.
    expect(fees.grossOnlineAmount).toBe('280000');
    expect(fees.onlineAmount).toBe('180000');
    // Chủ xe VẪN được nhận đủ cọc: nền tảng bù phần chênh.
    expect(fees.ownerPayableAmount).toBe('280000');
  });
});

describe('resolveHoldAllocation + tài trợ — tổng phân bổ = TIỀN MẶT đã nhận', () => {
  /** Bốn dòng tiền của một hold có tài trợ 100.000đ: khách chuyển 320.000đ. */
  const lines = {
    deposit: '280000',
    serviceFee: '140000',
    vehicleInsurance: '0',
    personalInsurance: '0',
    promoDiscount: '100000',
  };
  /** `D + S + IV + IP − P` — con số `booking_holds.amount` mang. */
  const CASH = 320000;

  it('CHUYẾN HOÀN THÀNH: chủ xe nhận ĐỦ cọc, nền tảng gánh tài trợ', () => {
    const allocation = resolveHoldAllocation(lines, 'settled');
    const totals = allocationTotals(allocation);

    // Quyền lợi của chủ xe KHÔNG đổi vì nền tảng giảm giá cho khách.
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('280000');
    // Nền tảng: 140.000 phí dịch vụ − 100.000 tài trợ = 40.000.
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('40000');
    expect(sum(totals)).toBe(CASH);
  });

  it('tài trợ LỚN HƠN phí dịch vụ ⇒ dòng nền tảng ÂM, và đó là một khoản chi thật', () => {
    const allocation = resolveHoldAllocation({ ...lines, promoDiscount: '200000' }, 'settled');
    const totals = allocationTotals(allocation);
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('280000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('-60000');
    // 280.000 + 140.000 − 200.000 = 220.000 — vẫn đúng bằng tiền mặt đã nhận.
    expect(sum(totals)).toBe(220000);
  });

  it('HOÀN TOÀN BỘ: khách chỉ nhận lại ĐÚNG số họ đã chuyển, không phải quyền lợi gộp', () => {
    /*
     * Hoàn cả phần tài trợ là biến mã khuyến mãi thành tiền mặt: đặt xe, huỷ trong cửa sổ miễn
     * phí, và rút phần XePrime bỏ ra về ví.
     */
    const allocation = resolveHoldAllocation(lines, 'refund_all');
    const totals = allocationTotals(allocation);
    expect(totals[ALLOCATION_TARGET.CUSTOMER_BALANCE]).toBe(String(CASH));
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('0');
    expect(sum(totals)).toBe(CASH);
  });

  it('HOÀN: phần tài trợ trừ theo thứ tự CỌC → PHÍ DỊCH VỤ, không bao giờ vào bảo hiểm', () => {
    const withInsurance = {
      deposit: '50000',
      serviceFee: '140000',
      vehicleInsurance: '30000',
      personalInsurance: '20000',
      promoDiscount: '100000',
    };
    const allocation = resolveHoldAllocation(withInsurance, 'refund_all');
    const byKey = (key: string) =>
      allocation.filter((l) => l.key === key).reduce((s, l) => s + Number(l.amount), 0);

    // Cọc 50.000 bị ăn hết, 50.000 còn lại trừ vào phí dịch vụ.
    expect(byKey(FEE_LINE.DEPOSIT)).toBe(0);
    expect(byKey(FEE_LINE.SERVICE_FEE)).toBe(90000);
    // Bảo hiểm hoàn ĐỦ — đó là tiền khách trả cho hãng bảo hiểm, không phải chỗ để tài trợ.
    expect(byKey(FEE_LINE.VEHICLE_PROTECTION)).toBe(30000);
    expect(byKey(FEE_LINE.TRIP_INSURANCE)).toBe(20000);
    expect(sum(allocationTotals(allocation))).toBe(50000 + 140000 + 30000 + 20000 - 100000);
  });

  it('HUỶ MUỘN: chủ xe nhận đủ NỬA QUYỀN LỢI, nền tảng gánh tài trợ', () => {
    const allocation = resolveHoldAllocation(lines, 'split_late_cancel');
    const totals = allocationTotals(allocation);
    // Nửa của (280.000 + 140.000) = 210.000 — không nhỏ đi vì nền tảng đã giảm giá cho khách.
    expect(totals[ALLOCATION_TARGET.OWNER_BALANCE]).toBe('210000');
    expect(totals[ALLOCATION_TARGET.PLATFORM_REVENUE]).toBe('110000');
    expect(sum(totals)).toBe(CASH);
  });

  it('KHÔNG có tài trợ ⇒ phân bổ y hệt trước ADR 0046 (tổng = bốn dòng tiền)', () => {
    const noPromo = { ...lines, promoDiscount: '0' };
    for (const kind of ['refund_all', 'split_late_cancel', 'settled'] as const) {
      expect(sum(allocationTotals(resolveHoldAllocation(noPromo, kind)))).toBe(420000);
    }
  });

  it('tài trợ vượt `D + S` bị KẸP — bất biến không phụ thuộc dữ liệu của bảng khác', () => {
    const allocation = resolveHoldAllocation({ ...lines, promoDiscount: '999999' }, 'settled');
    // Kẹp về 420.000 ⇒ tổng phân bổ về 0, không âm.
    expect(sum(allocationTotals(allocation))).toBe(0);
  });
});

function sum(totals: Record<string, string>): number {
  return Object.values(totals).reduce((s, v) => s + Number(v), 0);
}
