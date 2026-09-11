import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_TARGET,
  FEE_BEARER,
  FEE_LINE,
  computeCustomerFees,
  feePolicyActivationBlockers,
  resolveHoldAllocation,
  type FeePolicySnapshot,
} from './fee-policy';
import { BILLING_MODE } from './status/billing';

/**
 * Phép tính tiền của một chuyến — ADR 0032 điều 2–4, ADR 0033. Đây là số in lên VietQR và số
 * chia vào sổ ví, nên mọi nhánh làm tròn và mọi cổng bật/tắt đều phải có một dòng khẳng định.
 */
const PILOT: FeePolicySnapshot = {
  policyId: '01POLICY',
  version: 1,
  serviceFeePercent: 10,
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 120,
  freeCancelHours: 4,
  depositPercent: 20,
  depositMinAmount: '50000',
  depositMaxPercent: 50,
  taxEnabled: false,
  taxPercent: null,
  taxLabel: null,
  tripInsuranceEnabled: false,
  tripInsurancePercent: null,
  vehicleProtectionEnabled: false,
  vehicleProtectionPercent: null,
  insurancePartnerName: null,
};

describe('computeCustomerFees — ví dụ chuẩn của ADR 0032 (VF5 một ngày)', () => {
  /**
   * Ca này khoá TOÀN BỘ công thức bằng đúng các con số ADR 0032 in ra. Nếu nó đỏ thì hoặc code
   * sai, hoặc ADR đã đổi — không có khả năng thứ ba, và không được sửa số ở đây để nó xanh lại.
   */
  const policy: FeePolicySnapshot = {
    ...PILOT,
    taxEnabled: true,
    taxPercent: 7,
    taxLabel: 'VAT + TNCN',
    vehicleProtectionEnabled: true,
    // 130.000 / 700.000 ≈ 18,571428…% — số minh hoạ của ADR để ra tổng tròn 900.000.
    vehicleProtectionPercent: 18.571428571428573,
    insurancePartnerName: 'Đối tác bảo hiểm',
  };

  it('B=700k · S=70k · IV=130k ⇒ khách thấy 900k; D=140k ⇒ QR 340k, trả tay 560k, chủ xe nhận 91k', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      baseAmount: '700000',
    });

    expect(r.customerTotalAmount).toBe('900000');
    expect(r.depositAmount).toBe('140000');
    expect(r.onlineAmount).toBe('340000');
    expect(r.payAtPickupAmount).toBe('560000');
    expect(r.taxAmount).toBe('49000');
    expect(r.ownerPayableAmount).toBe('91000');
    expect(r.holdAmount).toBe('340000');
  });

  it('cọc KHÔNG cộng vào tổng khách — nó là một phần của giá thuê, cộng vào là thu hai lần', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      baseAmount: '700000',
    });
    expect(r.lines.some((l) => l.key === FEE_LINE.DEPOSIT)).toBe(false);
    // Tiền khách bỏ ra thật sự = trả online + trả tay, và đúng bằng tổng đã báo.
    expect(Number(r.onlineAmount) + Number(r.payAtPickupAmount)).toBe(
      Number(r.customerTotalAmount),
    );
  });

  it('thuế nằm phía CHỦ XE: không vào tổng khách, trừ vào tiền chủ xe nhận', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      baseAmount: '700000',
    });
    const tax = r.lines.find((l) => l.key === FEE_LINE.TAX)!;
    expect(tax.bearer).toBe(FEE_BEARER.OWNER);
    expect(r.ownerNetAmount).toBe('651000'); // 700.000 − 49.000
  });

  it('bảo hiểm xe nằm phía KHÁCH (ADR 0032 ghi đè ADR 0028)', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      baseAmount: '700000',
    });
    expect(r.lines.find((l) => l.key === FEE_LINE.VEHICLE_PROTECTION)!.bearer).toBe(
      FEE_BEARER.CUSTOMER,
    );
  });
});

describe('computeCustomerFees — tuyến hoa hồng (Basic Owner)', () => {
  it('10% cộng vào giá KHÁCH, chủ xe nhận ĐỦ giá niêm yết khi chưa bật thuế', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '780000',
    });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({
      key: FEE_LINE.SERVICE_FEE,
      bearer: FEE_BEARER.CUSTOMER,
      percent: 10,
      amount: '78000',
    });
    expect(r.customerFeeTotal).toBe('78000');
    expect(r.customerTotalAmount).toBe('858000');
    // Lời hứa của ADR 0029: phí KHÔNG khấu trừ khỏi tiền thuê của chủ xe.
    expect(r.ownerNetAmount).toBe('780000');
    // D = 20% × 780.000 = 156.000; online = D + S.
    expect(r.depositAmount).toBe('156000');
    expect(r.holdAmount).toBe('234000');
  });

  it('làm tròn HALF_UP tới đồng', () => {
    // 10% của 123.455 = 12.345,5 → 12.346
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '123455',
    });
    expect(r.lines[0]!.amount).toBe('12346');
  });

  it('sàn CỌC là sàn: % ra số nhỏ hơn sàn thì lấy sàn', () => {
    // 20% của 100.000 = 20.000 < sàn cọc 50.000.
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '100000',
    });
    expect(r.depositAmount).toBe('50000');
    expect(r.payAtPickupAmount).toBe('50000');
    expect(r.holdAmount).toBe('60000'); // 50.000 + phí dịch vụ 10.000
  });

  it('sàn cọc lớn hơn cả giá thuê ⇒ kẹp về giá thuê, KHÔNG bao giờ sinh số trả tay âm', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: { ...PILOT, depositMinAmount: '500000' },
      baseAmount: '300000',
    });
    expect(r.depositAmount).toBe('300000');
    expect(r.payAtPickupAmount).toBe('0');
  });

  it('báo giá TẠM TÍNH ⇒ vẫn hiện phí dự kiến nhưng KHÔNG thu cọc (không lấy % trên số chưa chốt)', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '780000',
      quoteIsEstimate: true,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.depositAmount).toBe('0');
    expect(r.holdAmount).toBeNull();
  });
});

describe('computeCustomerFees — tuyến gói (Gian hàng)', () => {
  it('0% và KHÔNG sinh dòng phí; mặc định cũng KHÔNG thu cọc', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      policy: PILOT,
      baseAmount: '780000',
    });
    expect(r.lines).toEqual([]);
    expect(r.customerTotalAmount).toBe('780000');
    expect(r.ownerNetAmount).toBe('780000');
    expect(r.depositAmount).toBe('0');
    expect(r.holdAmount).toBeNull();
  });

  it('gian hàng BẬT công tắc cọc ⇒ thu đúng D, phí dịch vụ vẫn 0 (ADR 0032 điều 1)', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      policy: PILOT,
      baseAmount: '780000',
      depositRequired: true,
    });
    expect(r.lines).toEqual([]);
    expect(r.depositAmount).toBe('156000');
    expect(r.holdAmount).toBe('156000');
    expect(r.payAtPickupAmount).toBe('624000');
  });

  it('tuyến hoa hồng KHÔNG tắt được cọc — truyền false vẫn phải là quy tắc của caller, không của phép tính', () => {
    // Hàm thuần tôn trọng tham số; việc chặn tắt nằm ở `DepositPolicyService` (Phase 6).
    // Ca này khoá MẶC ĐỊNH: không truyền gì thì tuyến hoa hồng luôn có cọc.
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '780000',
    });
    expect(r.holdAmount).not.toBeNull();
  });
});

describe('computeCustomerFees — bảo hiểm tai nạn người (IP) là TUỲ CHỌN', () => {
  const policy: FeePolicySnapshot = {
    ...PILOT,
    tripInsuranceEnabled: true,
    tripInsurancePercent: 3,
    insurancePartnerName: 'Đối tác bảo hiểm',
  };

  it('khách KHÔNG giữ lựa chọn ⇒ không có dòng, không thu đồng nào', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      baseAmount: '1000000',
    });
    expect(r.lines.some((l) => l.key === FEE_LINE.TRIP_INSURANCE)).toBe(false);
  });

  it('khách GIỮ lựa chọn ⇒ cộng vào tổng khách và vào số quét QR', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      baseAmount: '1000000',
      personalAccidentSelected: true,
    });
    expect(r.lines.find((l) => l.key === FEE_LINE.TRIP_INSURANCE)!.amount).toBe('30000');
    expect(r.customerTotalAmount).toBe('1130000'); // 1.000.000 + 100.000 + 30.000
    expect(r.onlineAmount).toBe('330000'); // D 200.000 + S 100.000 + IP 30.000
  });

  it('cổng TẮT ở chính sách thì khách có chọn cũng không thu — cổng thắng lựa chọn', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '1000000',
      personalAccidentSelected: true,
    });
    expect(r.lines.some((l) => l.key === FEE_LINE.TRIP_INSURANCE)).toBe(false);
  });

  it('baseAmount rác thì ném — không im lặng cho ra 0', () => {
    expect(() =>
      computeCustomerFees({ billingMode: BILLING_MODE.COMMISSION, policy: PILOT, baseAmount: 'abc' }),
    ).toThrow();
  });
});

describe('resolveHoldAllocation — ADR 0033 điều 3', () => {
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
    const out = resolveHoldAllocation(lines, 'split_late_cancel');
    const toOwner = out.find((e) => e.target === ALLOCATION_TARGET.OWNER_BALANCE)!;
    const toPlatform = out.find((e) => e.target === ALLOCATION_TARGET.PLATFORM_REVENUE)!;
    const toCustomer = out
      .filter((e) => e.target === ALLOCATION_TARGET.CUSTOMER_BALANCE)
      .reduce((t, e) => t + Number(e.amount), 0);

    expect(Number(toOwner.amount)).toBe(105000); // (140.000 + 70.000) / 2
    expect(Number(toPlatform.amount)).toBe(105000);
    expect(toCustomer).toBe(130000); // bảo hiểm chưa mua ⇒ hoàn đủ
    expect(sum(out)).toBe(340000);
  });

  it('chia đôi số LẺ: phần dư về nền tảng, tổng không được lệch một đồng', () => {
    const odd = { ...lines, deposit: '100001', serviceFee: '0', vehicleInsurance: '0' };
    const out = resolveHoldAllocation(odd, 'split_late_cancel');
    expect(Number(out.find((e) => e.target === ALLOCATION_TARGET.OWNER_BALANCE)!.amount)).toBe(50000);
    expect(Number(out.find((e) => e.target === ALLOCATION_TARGET.PLATFORM_REVENUE)!.amount)).toBe(
      50001,
    );
    expect(sum(out)).toBe(100001);
  });

  it('chuyến hoàn thành: chủ xe nhận D−T, XePrime ghi nhận S, bảo hiểm thành khoản phải trả', () => {
    const out = resolveHoldAllocation(lines, 'settled', '49000');
    expect(Number(out.find((e) => e.target === ALLOCATION_TARGET.OWNER_BALANCE)!.amount)).toBe(91000);
    expect(Number(out.find((e) => e.target === ALLOCATION_TARGET.PLATFORM_REVENUE)!.amount)).toBe(
      70000,
    );
    expect(Number(out.find((e) => e.target === ALLOCATION_TARGET.INSURER_PAYABLE)!.amount)).toBe(
      130000,
    );
  });

  it('không bao giờ sinh dòng 0đ — sổ cái không chứa bút toán rỗng', () => {
    const out = resolveHoldAllocation(
      { deposit: '100000', serviceFee: '0', vehicleInsurance: '0', personalInsurance: '0' },
      'refund_all',
    );
    expect(out).toHaveLength(1);
  });
});

describe('feePolicyActivationBlockers — ADR 0028 điều 4–5, ADR 0033', () => {
  it('chính sách pilot (phí dịch vụ + cọc) kích hoạt được', () => {
    expect(feePolicyActivationBlockers(PILOT)).toEqual([]);
  });

  it('bật thuế mà không có tỷ lệ + tên loại thuế ⇒ chặn', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, taxEnabled: true })).toContain(
      'tax_requires_rate_and_label',
    );
  });

  it('bật bảo hiểm mà chưa có ĐỐI TÁC THẬT ⇒ chặn (không dùng tên PVI trước hợp đồng)', () => {
    expect(
      feePolicyActivationBlockers({
        ...PILOT,
        tripInsuranceEnabled: true,
        tripInsurancePercent: 3,
      }),
    ).toContain('insurance_requires_partner');
  });

  it('phí dịch vụ ngoài biên ⇒ chặn', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, serviceFeePercent: 31 })).toContain(
      'service_fee_out_of_range',
    );
  });

  it('cọc vượt trần của chính sách ⇒ chặn (cọc không được thành thu tiền thuê trước)', () => {
    expect(feePolicyActivationBlockers({ ...PILOT, depositPercent: 60 })).toContain(
      'deposit_percent_out_of_range',
    );
  });

  it('cọc THẤP HƠN thuế ⇒ chặn: nền tảng không giữ đủ tiền để nộp thay', () => {
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
});
