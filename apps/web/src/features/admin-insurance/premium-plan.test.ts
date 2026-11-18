import { describe, expect, it } from 'vitest';
import { MIC_VCX_TRIP_DEFAULT_TIERS } from '@xeprime/types';
import { premiumPlan, previousTierDays } from './premium-plan';

describe('premiumPlan (ADR 0097)', () => {
  it('xe 340 triệu khớp biểu phí MIC đo trên sandbox, kèm phí thu hộ và hoa hồng', () => {
    const rows = premiumPlan('340000000', {
      tiers: MIC_VCX_TRIP_DEFAULT_TIERS,
      serviceFeePercent: 10,
      agencyCommissionPercent: 15,
    });
    expect(rows?.map((r) => r.premium)).toEqual(['44200', '112200', '224400', '333200', '680000']);
    expect(rows?.[0]).toEqual({
      maxDays: 2,
      percent: '0.013',
      premium: '44200',
      serviceFee: '4420',
      customerPays: '48620',
      commission: '6630',
      netToPartner: '37570',
      platformEarns: '11050',
    });
  });

  it('phí thu hộ tắt, hoa hồng 0 ⇒ khách trả đúng phí MIC, XePrime không giữ gì', () => {
    const [first] = premiumPlan('500000000', {
      tiers: MIC_VCX_TRIP_DEFAULT_TIERS,
      serviceFeePercent: null,
      agencyCommissionPercent: 0,
    })!;
    expect(first).toMatchObject({
      premium: '65000',
      serviceFee: '0',
      customerPays: '65000',
      netToPartner: '65000',
      platformEarns: '0',
    });
  });

  it('giá trị xe chưa hợp lệ ⇒ null', () => {
    const config = {
      tiers: MIC_VCX_TRIP_DEFAULT_TIERS,
      serviceFeePercent: 0,
      agencyCommissionPercent: 0,
    };
    expect(premiumPlan('', config)).toBeNull();
    expect(premiumPlan('0', config)).toBeNull();
    expect(premiumPlan('12.5', config)).toBeNull();
  });

  it('bậc trước', () => {
    expect(previousTierDays(MIC_VCX_TRIP_DEFAULT_TIERS, 0)).toBe(0);
    expect(previousTierDays(MIC_VCX_TRIP_DEFAULT_TIERS, 2)).toBe(5);
  });
});
