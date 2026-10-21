import { DELIVERY_TIER_FEE_MODE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import { deliveryTierSchema, vehiclePricingFormSchema } from './index';

/** Bậc giao xe trọn gói / theo km và bước giá 1.000đ (ADR 0064) — cùng luật với `@IsMoneyStep` của API. */
const errorsOf = async (value: unknown): Promise<string[]> => {
  try {
    await deliveryTierSchema.validate(value, { abortEarly: false });
    return [];
  } catch (error) {
    return (error as { errors: string[] }).errors;
  }
};

describe('deliveryTierSchema', () => {
  it('bậc trọn gói cũ (không có feeMode) vẫn hợp lệ', async () => {
    expect(await errorsOf({ toKm: 5, fee: 0 })).toEqual([]);
    expect(await errorsOf({ toKm: 10, fee: 30000 })).toEqual([]);
  });

  it('phí không phải bội 1.000đ ⇒ moneyThousandStep', async () => {
    expect(await errorsOf({ toKm: 10, fee: 30500 })).toContain('moneyThousandStep');
  });

  it('bậc theo km cần đơn giá > 0, bội 1.000đ', async () => {
    const perKm = (value: number | null) => ({
      toKm: 15,
      feeMode: DELIVERY_TIER_FEE_MODE.PER_KM,
      fee: null,
      perKm: value,
    });
    expect(await errorsOf(perKm(10000))).toEqual([]);
    expect(await errorsOf(perKm(null))).toContain('perKmRequired');
    expect(await errorsOf(perKm(0))).toContain('perKmRequired');
    expect(await errorsOf(perKm(10500))).toContain('moneyThousandStep');
  });
});

describe('vehiclePricingFormSchema — giá xe theo bước 1.000đ', () => {
  it('giá có tài xế lẻ ⇒ moneyThousandStep', async () => {
    const base = vehiclePricingFormSchema.cast({}, { assert: false }) as Record<string, unknown>;
    await expect(
      vehiclePricingFormSchema.validateAt('withDriverDailyPrice', {
        ...base,
        withDriverDailyPrice: 1_250_500,
      }),
    ).rejects.toMatchObject({ errors: ['moneyThousandStep'] });
    await expect(
      vehiclePricingFormSchema.validateAt('withDriverDailyPrice', {
        ...base,
        withDriverDailyPrice: 1_250_000,
      }),
    ).resolves.toBe(1_250_000);
  });
});
