import { describe, expect, it } from 'vitest';
import {
  computeValueTierPremium,
  INSURANCE_ELIGIBILITY_GAP,
  insurancePremiumTierFor,
  insurancePremiumTiersProblem,
  insuranceRemittanceCommission,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  readInsurancePremiumTiers,
} from './insurance';
import {
  insuranceEligibilityGaps,
  vehicleProtectionTierQuote,
  type InsuranceEligibilityInput,
} from './insurance-eligibility';
import { SERVICE_TYPE, VEHICLE_TYPE } from './vehicle';

const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(Date.UTC(2026, 11, 10, 2, 0) + hours * HOUR);

const eligible: InsuranceEligibilityInput = {
  vehicleType: VEHICLE_TYPE.CAR,
  insuredValue: '340000000.00',
  brand: 'Toyota',
  model: 'Vios',
  manufactureYear: 2019,
  seatCount: 5,
  imageTypes: ['front', 'rear', 'left', 'right', 'interior', 'other'],
  registration: { chassisNumber: 'RL4100000VN0', holderName: 'Tran Quoc Bao' },
};

describe('biểu phí bậc MIC (ADR 0088)', () => {
  it('khớp đúng số MIC sandbox trả cho xe 340.000.000đ', () => {
    // Bảng đo ngày 11/11/2026: ≤2 · ≤5 · ≤10 · ≤15 · ≤30 ngày.
    const expected = ['44200', '112200', '224400', '333200', '680000'];
    MIC_VCX_TRIP_DEFAULT_TIERS.forEach((tier, i) => {
      expect(computeValueTierPremium('340000000', tier.percent)).toBe(expected[i]);
    });
  });

  it('giờ lẻ làm tròn LÊN tới bậc: 9 giờ ⇒ ≤2 ngày, 57 giờ ⇒ ≤5 ngày, đúng 48 giờ ⇒ ≤2 ngày', () => {
    expect(insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, at(0), at(9))?.maxDays).toBe(2);
    expect(insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, at(0), at(57))?.maxDays).toBe(5);
    expect(insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, at(0), at(48))?.maxDays).toBe(2);
    expect(insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, at(0), at(11 * 24))?.maxDays).toBe(
      15,
    );
  });

  it('chuyến dài hơn bậc cuối hoặc thời lượng không dương ⇒ không có bậc', () => {
    expect(insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, at(0), at(35 * 24))).toBeNull();
    expect(insurancePremiumTierFor(MIC_VCX_TRIP_DEFAULT_TIERS, at(5), at(5))).toBeNull();
  });

  it('làm tròn tới đồng, nửa lên, không mất độ chính xác ở giá trị lớn', () => {
    expect(computeValueTierPremium('333333000', '0.013')).toBe('43333');
    expect(computeValueTierPremium('20000000000', '9.9999')).toBe('1999980000');
    expect(computeValueTierPremium('1000', '0.05')).toBe('1'); // 0,5đ ⇒ 1đ
  });

  it('kiểm biểu phí: tăng dần ngặt, ngày 1-30, % hợp lệ', () => {
    expect(insurancePremiumTiersProblem(MIC_VCX_TRIP_DEFAULT_TIERS)).toBeNull();
    expect(insurancePremiumTiersProblem([])).not.toBeNull();
    expect(
      insurancePremiumTiersProblem([
        { maxDays: 5, percent: '0.03' },
        { maxDays: 2, percent: '0.05' },
      ]),
    ).not.toBeNull();
    expect(insurancePremiumTiersProblem([{ maxDays: 31, percent: '0.2' }])).not.toBeNull();
    expect(insurancePremiumTiersProblem([{ maxDays: 2, percent: '0' }])).not.toBeNull();
    expect(insurancePremiumTiersProblem([{ maxDays: 2, percent: '0.12345' }])).not.toBeNull();
    expect(readInsurancePremiumTiers([{ maxDays: 2, percent: 0.013 }])).toBeNull();
    expect(readInsurancePremiumTiers(MIC_VCX_TRIP_DEFAULT_TIERS)).toEqual(
      MIC_VCX_TRIP_DEFAULT_TIERS,
    );
  });

  it('hoa hồng đại lý của bảng kê đúng tới đồng', () => {
    expect(insuranceRemittanceCommission('1000000', '10')).toBe('100000');
    expect(insuranceRemittanceCommission('44200', '12.5')).toBe('5525');
    expect(insuranceRemittanceCommission('44200', '0')).toBe('0');
  });
});

describe('điều kiện xe bán kèm bảo hiểm (ADR 0088 điều 2)', () => {
  it('xe đủ dữ liệu ⇒ không thiếu gì', () => {
    expect(insuranceEligibilityGaps(eligible)).toEqual([]);
  });

  it('xe máy ⇒ chỉ một lý do', () => {
    expect(insuranceEligibilityGaps({ ...eligible, vehicleType: VEHICLE_TYPE.MOTORBIKE })).toEqual([
      INSURANCE_ELIGIBILITY_GAP.NOT_CAR,
    ]);
  });

  it('liệt kê đủ mọi thứ còn thiếu', () => {
    expect(
      insuranceEligibilityGaps({
        ...eligible,
        insuredValue: null,
        imageTypes: ['front', 'rear', 'left', 'right'],
        registration: { chassisNumber: '  ', holderName: 'A' },
        seatCount: null,
      }),
    ).toEqual([
      INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING,
      INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING,
      INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING,
      INSURANCE_ELIGIBILITY_GAP.VEHICLE_INFO_MISSING,
    ]);
  });

  it('báo giá chuyến: chỉ tự lái, chỉ xe đủ điều kiện, chỉ trong phạm vi bậc', () => {
    const base = {
      eligibility: eligible,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      tiers: MIC_VCX_TRIP_DEFAULT_TIERS,
      pickupAt: at(0),
      returnAt: at(57),
    };
    expect(vehicleProtectionTierQuote(base)).toEqual({
      amount: '112200',
      insuredValue: '340000000',
      maxDays: 5,
      percent: '0.033',
    });
    expect(
      vehicleProtectionTierQuote({ ...base, serviceType: SERVICE_TYPE.WITH_DRIVER }),
    ).toBeNull();
    expect(
      vehicleProtectionTierQuote({ ...base, eligibility: { ...eligible, insuredValue: null } }),
    ).toBeNull();
    expect(vehicleProtectionTierQuote({ ...base, returnAt: at(31 * 24) })).toBeNull();
  });
});
