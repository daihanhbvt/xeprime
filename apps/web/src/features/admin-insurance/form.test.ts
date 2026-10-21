import { describe, expect, it } from 'vitest';
import {
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PRODUCT_LIMITS,
  INSURANCE_PROVIDER,
} from '@xeprime/types';
import {
  buildInsuranceProductSchema,
  insuranceProductFormDefaults,
  isCertificateUrlTemplate,
  toUpdateInsuranceProductBody,
  type InsuranceProductFormValues,
} from './form';
import type { InsuranceProduct } from './types';

/**
 * Form sửa sản phẩm bảo hiểm (ADR 0064) — biên trường là CHÍNH bảng DTO server dùng
 * (`INSURANCE_PRODUCT_LIMITS`), tiền là bội 1.000đ, mẫu URL GCN phải có chỗ thay số chứng nhận.
 */
const schema = buildInsuranceProductSchema({
  required: 'required',
  tooShort: (min) => `tooShort:${min}`,
  tooLong: (max) => `tooLong:${max}`,
  amountMin: 'amountMin',
  amountMax: 'amountMax',
  amountStep: 'amountStep',
  urlTemplate: 'urlTemplate',
  displayOrder: (min, max) => `displayOrder:${min}-${max}`,
});

const PRODUCT = {
  id: 'P1',
  kind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
  provider: INSURANCE_PROVIDER.MIC,
  partnerProductCode: 'MIC-VC',
  nameVi: 'Bảo hiểm vật chất xe',
  nameEn: 'Vehicle damage cover',
  coverageVi: 'Bồi thường thiệt hại vật chất xe.',
  coverageEn: 'Covers physical damage to the vehicle.',
  deductibleCar: '2000000',
  deductibleMotorbike: null,
  maxPayoutCar: null,
  maxPayoutMotorbike: null,
  maxPayoutNoteVi: null,
  maxPayoutNoteEn: null,
  certificateUrlTemplate: 'https://mic.vn/gcn/{certCode}',
  displayOrder: 1,
  isActive: true,
  updatedAt: '2026-08-01T00:00:00.000Z',
} as InsuranceProduct;

const valid = (): InsuranceProductFormValues => insuranceProductFormDefaults(PRODUCT);

async function errorsOf(values: InsuranceProductFormValues): Promise<string[]> {
  try {
    await schema.validate(values, { abortEarly: false });
    return [];
  } catch (err) {
    return (err as { errors: string[] }).errors;
  }
}

describe('admin-insurance form', () => {
  it('sản phẩm đang có ⇒ form hợp lệ, và payload trả tiền về chuỗi số nguyên / null', async () => {
    expect(await errorsOf(valid())).toEqual([]);
    const body = toUpdateInsuranceProductBody(valid());
    expect(body.deductibleCar).toBe('2000000');
    expect(body.deductibleMotorbike).toBeNull();
    // Ghi chú rỗng đi lên là `null` (xoá), không phải chuỗi rỗng.
    expect(body.maxPayoutNoteVi).toBeNull();
  });

  it('tiền không phải bội 1.000đ / âm / quá trần ⇒ báo đúng lỗi', async () => {
    expect(await errorsOf({ ...valid(), deductibleCar: 1500 })).toContain('amountStep');
    expect(await errorsOf({ ...valid(), deductibleCar: -1000 })).toContain('amountMin');
    expect(
      await errorsOf({ ...valid(), maxPayoutCar: 10 ** INSURANCE_PRODUCT_LIMITS.amountMaxDigits }),
    ).toContain('amountMax');
  });

  it('tên quá ngắn / quá dài theo đúng biên của DTO', async () => {
    const { min, max } = INSURANCE_PRODUCT_LIMITS.name;
    expect(await errorsOf({ ...valid(), nameEn: 'x'.repeat(min - 1) })).toContain(
      `tooShort:${min}`,
    );
    expect(await errorsOf({ ...valid(), nameVi: 'x'.repeat(max + 1) })).toContain(`tooLong:${max}`);
  });

  it('mẫu URL GCN: phải https và có {certCode}', async () => {
    expect(isCertificateUrlTemplate('https://mic.vn/gcn/{certCode}')).toBe(true);
    expect(isCertificateUrlTemplate('http://mic.vn/gcn/{certCode}')).toBe(false);
    expect(isCertificateUrlTemplate('https://mic.vn/gcn/')).toBe(false);
    expect(await errorsOf({ ...valid(), certificateUrlTemplate: 'https://mic.vn/x' })).toContain(
      'urlTemplate',
    );
  });

  it('thứ tự hiển thị ngoài biên ⇒ lỗi kèm biên', async () => {
    const { min, max } = INSURANCE_PRODUCT_LIMITS.displayOrder;
    expect(await errorsOf({ ...valid(), displayOrder: max + 1 })).toContain(
      `displayOrder:${min}-${max}`,
    );
  });
});
