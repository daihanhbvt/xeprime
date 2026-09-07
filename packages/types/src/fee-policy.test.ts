import { describe, expect, it } from 'vitest';
import {
  FEE_BEARER,
  FEE_LINE,
  computeCustomerFees,
  feePolicyActivationBlockers,
  type FeePolicySnapshot,
} from './fee-policy';
import { BILLING_MODE } from './status/billing';

/**
 * Phép tính phụ phí phía KHÁCH — ADR 0029 điều 1–2. Đây là số tiền in lên VietQR, nên mọi
 * nhánh làm tròn và mọi cổng bật/tắt đều phải có một dòng khẳng định.
 */
const PILOT: FeePolicySnapshot = {
  policyId: '01POLICY',
  version: 1,
  serviceFeePercent: 10,
  holdMinAmount: '20000',
  holdPaymentWindowMinutes: 1440,
  freeCancelHours: 4,
  taxEnabled: false,
  taxPercent: null,
  taxLabel: null,
  tripInsuranceEnabled: false,
  tripInsurancePercent: null,
  vehicleProtectionEnabled: false,
  vehicleProtectionPercent: null,
  insurancePartnerName: null,
};

describe('computeCustomerFees — tuyến hoa hồng (Basic Owner)', () => {
  it('10% cộng vào giá KHÁCH, chủ xe nhận ĐỦ giá niêm yết', () => {
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
    // Giữ chỗ = phí dịch vụ (R3 — XePrime chỉ giữ tiền của mình).
    expect(r.holdAmount).toBe('78000');
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

  it('sàn giữ chỗ là SÀN, không phải làm tròn: phí dưới sàn thì hold = sàn, phí vẫn là phí', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '100000', // phí 10.000 < sàn 20.000
    });
    expect(r.lines[0]!.amount).toBe('10000');
    expect(r.customerTotalAmount).toBe('110000');
    expect(r.holdAmount).toBe('20000');
  });

  it('báo giá TẠM TÍNH ⇒ vẫn hiện phí dự kiến nhưng KHÔNG thu giữ chỗ (không lấy % trên số chưa chốt)', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: PILOT,
      baseAmount: '780000',
      quoteIsEstimate: true,
    });
    expect(r.lines).toHaveLength(1);
    expect(r.holdAmount).toBeNull();
  });
});

describe('computeCustomerFees — tuyến gói (Gian hàng)', () => {
  it('0% và KHÔNG sinh dòng — bảng kê không có "phí dịch vụ 0đ" lấp lửng', () => {
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      policy: PILOT,
      baseAmount: '780000',
    });
    expect(r.lines).toEqual([]);
    expect(r.customerTotalAmount).toBe('780000');
    expect(r.ownerNetAmount).toBe('780000');
    expect(r.holdAmount).toBeNull();
  });
});

describe('computeCustomerFees — cổng thuế / bảo hiểm (chưa bật ở R3, phép tính vẫn phải đúng)', () => {
  it('thuế và bảo hiểm chuyến áp cho CẢ hai tuyến; bảo vệ xe trừ phía CHỦ XE', () => {
    const policy: FeePolicySnapshot = {
      ...PILOT,
      taxEnabled: true,
      taxPercent: 7,
      taxLabel: 'VAT + TNCN',
      tripInsuranceEnabled: true,
      tripInsurancePercent: 3,
      vehicleProtectionEnabled: true,
      vehicleProtectionPercent: 2,
      insurancePartnerName: 'Đối tác bảo hiểm',
    };
    const r = computeCustomerFees({
      billingMode: BILLING_MODE.PACKAGE,
      policy,
      baseAmount: '1000000',
    });
    const keys = r.lines.map((l) => l.key);
    expect(keys).toEqual([FEE_LINE.TAX, FEE_LINE.TRIP_INSURANCE, FEE_LINE.VEHICLE_PROTECTION]);
    // Khách gánh thuế + bảo hiểm chuyến: 70.000 + 30.000
    expect(r.customerFeeTotal).toBe('100000');
    expect(r.customerTotalAmount).toBe('1100000');
    // Chủ xe chịu bảo vệ xe: 20.000
    expect(r.ownerNetAmount).toBe('980000');
    // Tuyến gói không có phí dịch vụ ⇒ không có gì để giữ chỗ
    expect(r.holdAmount).toBeNull();
  });

  it('baseAmount rác thì ném — không im lặng cho ra 0', () => {
    expect(() =>
      computeCustomerFees({ billingMode: BILLING_MODE.COMMISSION, policy: PILOT, baseAmount: 'abc' }),
    ).toThrow();
  });
});

describe('feePolicyActivationBlockers — ADR 0028 điều 4–5', () => {
  it('chính sách pilot (chỉ phí dịch vụ) kích hoạt được', () => {
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
});
