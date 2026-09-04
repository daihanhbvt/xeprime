import { describe, expect, it } from 'vitest';
import * as yup from 'yup';
import { maxDecimalsTest, vehicleFormSchema } from './index';

const schema = yup.number().nullable().test(maxDecimalsTest(2, 'tối đa 2 chữ số thập phân'));

describe('maxDecimalsTest', () => {
  it('nhận số trong giới hạn và bỏ qua giá trị rỗng', () => {
    for (const value of [null, undefined, 1, 1.2, 1.23, 0, 999]) {
      expect(schema.isValidSync(value)).toBe(true);
    }
  });

  it('từ chối số quá số chữ số thập phân cho phép', () => {
    expect(schema.isValidSync(1.233)).toBe(false);
    expect(schema.isValidSync(0.001)).toBe(false);
  });

  it('đếm đúng cả khi số được viết ở dạng mũ — 1e-7 là 7 chữ số thập phân, không phải 0', () => {
    expect(schema.isValidSync(1e-7)).toBe(false);
    // 1.5e3 = 1500, không có phần thập phân nào.
    expect(schema.isValidSync(1.5e3)).toBe(true);
  });
});

describe('mức tiêu thụ nhiên liệu trên form xe', () => {
  /** Cột `Decimal(6, 2)` + `@IsNumber({ maxDecimalPlaces: 2 })` — yup phải chặn TRƯỚC server. */
  async function fuelError(value: number): Promise<string | undefined> {
    try {
      await vehicleFormSchema.validateAt('fuelConsumptionCity', {
        fuelConsumptionCity: value,
      } as never);
      return undefined;
    } catch (err) {
      return (err as yup.ValidationError).message;
    }
  }

  it('1.23 hợp lệ, 1.233 báo lỗi ngay tại ô thay vì rơi xuống server', async () => {
    expect(await fuelError(1.23)).toBeUndefined();
    expect(await fuelError(1.233)).toContain('2 chữ số thập phân');
  });

  it('giữ nguyên các ràng buộc cũ (âm, vượt trần)', async () => {
    expect(await fuelError(-1)).toContain('không được âm');
    expect(await fuelError(1000)).toContain('vượt quá giới hạn');
  });
});
