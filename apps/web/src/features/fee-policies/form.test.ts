import { describe, expect, it } from 'vitest';
import { FEE_SCHEDULE_DEFAULTS, VEHICLE_TYPE, computeTieredOwnerCommission } from '@xeprime/types';
import {
  buildFeePolicySchema,
  commissionPreview,
  commissionTierRanges,
  feePolicyFormDefaults,
  toUpsertFeePolicyBody,
  type FeePolicyFormValues,
} from './form';

/**
 * Form chính sách phí — luồng tiền v2.
 *
 * Ba thứ được khoá ở đây vì chúng là thứ dễ trôi khỏi server nhất:
 *  1. Mặc định của bản nháp mới là `FEE_SCHEDULE_DEFAULTS`, không phải bộ số % đời cũ.
 *  2. Luật nấc hoa hồng là của `feePolicyActivationBlockers` — form không được nói "được" với một
 *     bộ nấc server sẽ chặn ở cổng kích hoạt.
 *  3. Bật một loại bảo hiểm thì mọi loại xe phải có biểu phí > 0 — DB CHECK từ chối bản nháp nếu
 *     không, và lỗi đó phải hiện dưới ô chứ không thành một lỗi 500.
 */

const schema = buildFeePolicySchema({
  nameRequired: 'nameRequired',
  required: 'required',
  range: 'range',
  nonNegative: 'nonNegative',
  integer: 'integer',
  thousandStep: 'thousandStep',
  ratePositive: 'ratePositive',
  taxPercentRequired: 'taxPercentRequired',
  taxLabelRequired: 'taxLabelRequired',
  partnerRequired: 'partnerRequired',
  blocker: (code) => `blocker:${code}`,
});

function valid(over: Partial<FeePolicyFormValues> = {}): FeePolicyFormValues {
  return { ...feePolicyFormDefaults(null), name: 'v2', ...over };
}

/** Lỗi theo đường dẫn — `abortEarly: false` để thấy đủ. */
function errorsOf(values: FeePolicyFormValues): Record<string, string> {
  try {
    schema.validateSync(values, { abortEarly: false });
    return {};
  } catch (err) {
    const inner = (err as { inner: { path: string; message: string }[] }).inner;
    // Lỗi ĐẦU TIÊN của mỗi ô thắng — đúng cách `yupResolver` dựng lỗi cho RHF.
    const out: Record<string, string> = {};
    for (const e of inner) out[e.path] ??= e.message;
    return out;
  }
}

describe('feePolicyFormDefaults — tạo mới', () => {
  it('lấy bộ số luồng tiền v2', () => {
    const d = feePolicyFormDefaults(null);
    expect(d.depositPercent).toBe(30);
    expect(d.customerPlatformFee).toEqual({ car: 50_000, motorbike: 30_000 });
    expect(d.ownerCommissionTiers).toEqual(FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers);
    expect(d.vehicleProtectionDailyAmount).toEqual({ car: 50_000, motorbike: 15_000 });
    expect(d.tripInsuranceDailyAmount).toEqual({ car: 20_000, motorbike: 5_000 });
    expect(d.vehicleProtectionEnabled).toBe(false);
    expect(d.tripInsuranceEnabled).toBe(false);
  });

  it('mặc định hợp lệ ngay — admin chỉ cần đặt tên', () => {
    expect(errorsOf(valid())).toEqual({});
  });
});

describe('toUpsertFeePolicyBody', () => {
  it('tiền là chuỗi, không gửi bốn trường % đời cũ', () => {
    const body = toUpsertFeePolicyBody(valid());
    expect(body.customerPlatformFee).toEqual({ [VEHICLE_TYPE.CAR]: '50000', [VEHICLE_TYPE.MOTORBIKE]: '30000' });
    expect(body.depositMinAmount).toBe('50000');
    expect(body.holdMinAmount).toBe('20000');
    expect(body.vehicleProtectionDailyAmount).toEqual({ car: '50000', motorbike: '15000' });
    expect(body).not.toHaveProperty('serviceFeePercent');
    expect(body).not.toHaveProperty('tripInsurancePercent');
    expect(body).not.toHaveProperty('vehicleProtectionPercent');
  });

  it('cổng tắt thì không gửi tên đối tác / thuế', () => {
    const body = toUpsertFeePolicyBody(valid({ insurancePartnerName: 'X', taxLabel: 'Y', taxPercent: 5 }));
    expect(body.insurancePartnerName).toBeNull();
    expect(body.taxPercent).toBeNull();
    expect(body.taxLabel).toBeNull();
  });
});

describe('nấc hoa hồng lũy tiến', () => {
  it('nấc không tăng nghiêm ngặt bị chặn bằng chính luật của server', () => {
    const errors = errorsOf(
      valid({
        ownerCommissionTiers: [
          { fromDay: 1, percent: 10 },
          { fromDay: 5, percent: 7 },
          { fromDay: 5, percent: 3 },
        ],
      }),
    );
    expect(errors.ownerCommissionTiers).toBe('blocker:owner_commission_tiers_invalid');
  });

  it('nấc đầu phải bắt đầu từ ngày 1', () => {
    const errors = errorsOf(valid({ ownerCommissionTiers: [{ fromDay: 2, percent: 10 }] }));
    expect(errors.ownerCommissionTiers).toBe('blocker:owner_commission_tiers_invalid');
  });

  it('% vượt trần và ô trống báo ngay dưới ô', () => {
    const errors = errorsOf(
      valid({
        ownerCommissionTiers: [
          { fromDay: 1, percent: 31 },
          { fromDay: null, percent: 5 },
        ],
      }),
    );
    expect(errors['ownerCommissionTiers[0].percent']).toBe('range');
    expect(errors['ownerCommissionTiers[1].fromDay']).toBe('required');
  });

  it('khoảng ngày suy từ nấc kế tiếp, nấc cuối không có ngày cuối', () => {
    expect(commissionTierRanges(FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers)).toEqual([
      { fromDay: 1, toDay: 2, percent: 10 },
      { fromDay: 3, toDay: 7, percent: 7 },
      { fromDay: 8, toDay: 30, percent: 3 },
      { fromDay: 31, toDay: null, percent: 0 },
    ]);
  });

  it('ví dụ 5 ngày × 1.000.000đ dùng đúng phép tính chung', () => {
    const preview = commissionPreview(feePolicyFormDefaults(null).ownerCommissionTiers);
    // 2 × 10% + 3 × 7% của 1.000.000đ = 410.000đ.
    expect(preview?.commissionAmount).toBe('410000');
    expect(preview?.commissionAmount).toBe(
      computeTieredOwnerCommission(Array(5).fill(1_000_000), FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers),
    );
    expect(preview?.effectivePercent).toBe(8.2);
    expect(preview?.segments).toEqual([
      { fromDay: 1, toDay: 2, percent: 10 },
      { fromDay: 3, toDay: 5, percent: 7 },
    ]);
  });

  it('bộ nấc chưa hợp lệ thì không có ví dụ', () => {
    expect(commissionPreview([{ fromDay: 3, percent: 10 }])).toBeNull();
  });
});

describe('bảo hiểm', () => {
  it('tắt thì không đòi biểu phí', () => {
    const errors = errorsOf(valid({ vehicleProtectionDailyAmount: { car: 0, motorbike: 0 } }));
    expect(errors).toEqual({});
  });

  it('bật vật chất xe thì mọi loại xe cần phí ngày > 0 và cần tên đối tác', () => {
    const errors = errorsOf(
      valid({ vehicleProtectionEnabled: true, vehicleProtectionDailyAmount: { car: 50_000, motorbike: 0 } }),
    );
    expect(errors['vehicleProtectionDailyAmount.motorbike']).toBe('ratePositive');
    expect(errors['vehicleProtectionDailyAmount.car']).toBeUndefined();
    expect(errors.insurancePartnerName).toBe('partnerRequired');
  });

  it('bật tai nạn người với đủ phí và đối tác thì hợp lệ', () => {
    expect(
      errorsOf(valid({ tripInsuranceEnabled: true, insurancePartnerName: 'Bảo Việt' })),
    ).toEqual({});
  });
});

describe('tiền cấu hình & luật nhiều ô', () => {
  it('phí sàn phải là bội 1.000đ', () => {
    const errors = errorsOf(valid({ customerPlatformFee: { car: 50_500, motorbike: 30_000 } }));
    expect(errors['customerPlatformFee.car']).toBe('thousandStep');
  });

  it('% cọc vượt trần của chính sách', () => {
    const errors = errorsOf(valid({ depositPercent: 40, depositMaxPercent: 30 }));
    expect(errors.depositPercent).toBe('blocker:deposit_percent_out_of_range');
  });

  it('huỷ miễn phí ngắn hơn cửa sổ chuyển khoản', () => {
    const errors = errorsOf(valid({ freeCancelHours: 1, holdPaymentWindowMinutes: 120 }));
    expect(errors.freeCancelHours).toBe('blocker:free_cancel_shorter_than_payment_window');
  });

  it('bật thuế cần % và tên loại thuế', () => {
    const errors = errorsOf(valid({ taxEnabled: true }));
    expect(errors.taxPercent).toBe('taxPercentRequired');
    expect(errors.taxLabel).toBe('taxLabelRequired');
  });
});
