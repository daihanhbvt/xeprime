import { describe, expect, it } from 'vitest';
import { quickVehicleSchema } from './schema';

/**
 * Bước giá 1.000đ ở wizard đăng xe nhanh — cùng luật `@IsMoneyStep` của API (ADR 0064). Báo ngay
 * dưới ô bằng MÃ (`useValidationResolver` dịch), không để chủ xe bấm lưu rồi nhận lỗi chung.
 */
describe('quickVehicleSchema — bước giá 1.000đ', () => {
  const at = (path: 'weekdayPrice' | 'deliveryFee', value: unknown) =>
    quickVehicleSchema.validateAt(path, { [path]: value, deliveryEnabled: true });

  it('giá ngày lẻ nghìn ⇒ mã priceThousandStep', async () => {
    await expect(at('weekdayPrice', 333333)).rejects.toMatchObject({
      message: 'priceThousandStep',
    });
    await expect(at('weekdayPrice', 333000)).resolves.toBe(333000);
  });

  it('phí giao xe lẻ nghìn ⇒ mã deliveryFeeThousandStep', async () => {
    await expect(at('deliveryFee', 15500)).rejects.toMatchObject({
      message: 'deliveryFeeThousandStep',
    });
    await expect(at('deliveryFee', 0)).resolves.toBe(0);
  });
});
