import { describe, expect, it } from 'vitest';
import {
  computeValueTierPremium,
  INSURANCE_ELIGIBILITY_GAP,
  insurancePremiumTierFor,
  insurancePremiumTiersForYear,
  insurancePremiumTiersProblem,
  insurancePremiumYearBandsProblem,
  insuranceRemittanceCommission,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  readInsurancePremiumTiers,
  readInsurancePremiumYearBands,
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

describe('biểu phí theo năm sản xuất (ADR 0106)', () => {
  const tiers = [
    { maxDays: 2, percent: '0.013' },
    { maxDays: 5, percent: '0.033' },
  ];
  // Số đo sandbox MIC 18/11/2026 (hai bậc đầu).
  const bands = [
    { yearFrom: 2024, yearTo: null, percents: ['0.011', '0.028'] },
    { yearFrom: 2021, yearTo: 2023, percents: ['0.012', '0.03'] },
    { yearFrom: 2018, yearTo: 2020, percents: ['0.013', '0.033'] },
    { yearFrom: null, yearTo: 2015, percents: ['0.014', '0.035'] },
  ];

  it('chọn % của nhóm phủ năm sản xuất, giữ mốc ngày chung', () => {
    expect(insurancePremiumTiersForYear(tiers, bands, 2025)).toEqual([
      { maxDays: 2, percent: '0.011' },
      { maxDays: 5, percent: '0.028' },
    ]);
    // Đời xe mới hơn lần đồng bộ cuối vẫn có giá (nhóm mới nhất mở về tương lai).
    expect(insurancePremiumTiersForYear(tiers, bands, 2031)?.[0]?.percent).toBe('0.011');
    expect(insurancePremiumTiersForYear(tiers, bands, 2019)?.[1]?.percent).toBe('0.033');
    expect(insurancePremiumTiersForYear(tiers, bands, 1990)?.[0]?.percent).toBe('0.014');
  });

  it('năm không thuộc nhóm nào ⇒ null (hãng không bán); chưa có nhóm ⇒ biểu phí chung', () => {
    expect(insurancePremiumTiersForYear(tiers, bands, 2016)).toBeNull();
    expect(insurancePremiumTiersForYear(tiers, null, 2016)).toEqual(tiers);
    expect(insurancePremiumTiersForYear(tiers, bands, null)).toEqual(tiers);
  });

  it('kiểm nhóm năm: số % bằng số bậc, % tăng dần, không chồng năm', () => {
    expect(insurancePremiumYearBandsProblem(bands, tiers)).toBeNull();
    expect(insurancePremiumYearBandsProblem([], tiers)).not.toBeNull();
    expect(
      insurancePremiumYearBandsProblem(
        [{ yearFrom: 2020, yearTo: null, percents: ['0.011'] }],
        tiers,
      ),
    ).not.toBeNull();
    expect(
      insurancePremiumYearBandsProblem(
        [{ yearFrom: 2020, yearTo: null, percents: ['0.03', '0.011'] }],
        tiers,
      ),
    ).not.toBeNull();
    expect(
      insurancePremiumYearBandsProblem(
        [
          { yearFrom: 2020, yearTo: null, percents: ['0.011', '0.028'] },
          { yearFrom: 2015, yearTo: 2020, percents: ['0.012', '0.03'] },
        ],
        tiers,
      ),
    ).not.toBeNull();
    expect(
      insurancePremiumYearBandsProblem(
        [{ yearFrom: 2024, yearTo: 2020, percents: ['0.011', '0.028'] }],
        tiers,
      ),
    ).not.toBeNull();
  });

  it('đọc từ JSON: hỏng hình dạng ⇒ null, rỗng ⇒ null', () => {
    expect(readInsurancePremiumYearBands(bands, tiers)).toEqual(bands);
    expect(readInsurancePremiumYearBands([], tiers)).toBeNull();
    expect(readInsurancePremiumYearBands(null, tiers)).toBeNull();
    expect(
      readInsurancePremiumYearBands([{ yearFrom: '2020', yearTo: null, percents: [] }], tiers),
    ).toBeNull();
    expect(readInsurancePremiumYearBands(bands, null)).toBeNull();
  });
});
