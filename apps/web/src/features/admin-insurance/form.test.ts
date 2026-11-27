import { describe, expect, it } from 'vitest';
import {
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PRODUCT_LIMITS,
  INSURANCE_PROVIDER,
} from '@xeprime/types';
import {
  buildInsuranceProductSchema,
  insuranceProductFormDefaults,
  insuranceProductFormTabErrors,
  insuranceProductFormTabs,
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
  tiers: 'tiers',
  bands: 'bands',
  serviceFeePercent: (max) => `serviceFeePercent:${max}`,
  serviceFeePercentRequired: 'serviceFeePercentRequired',
  agencyCommissionPercent: (max) => `agencyCommissionPercent:${max}`,
  coverageItems: (max) => `coverageItems:${max}`,
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
  serviceFeeEnabled: false,
  serviceFeePercent: 0,
  agencyCommissionPercent: 0,
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

  describe('phạm vi bảo vệ (mỗi dòng một mục) + mô tả ngắn', () => {
    it('dòng đang lưu ⇒ các hàng; lưu lại ghép mỗi mục một dòng, bỏ hàng trống', () => {
      const form = {
        ...insuranceProductFormDefaults({ ...PRODUCT, coverageVi: 'Đâm va\nHoả hoạn' }),
      };
      expect(form.coverageVi).toEqual([{ text: 'Đâm va' }, { text: 'Hoả hoạn' }]);
      const body = toUpdateInsuranceProductBody({
        ...form,
        coverageVi: [...form.coverageVi, { text: '  ' }, { text: ' Mất cắp ' }],
        summaryVi: '  ',
        summaryEn: ' Collision ',
      });
      expect(body.coverageVi).toBe('Đâm va\nHoả hoạn\nMất cắp');
      // Mô tả ngắn trống = ghép từ các mục (null), không phải một dòng rỗng.
      expect(body.summaryVi).toBeNull();
      expect(body.summaryEn).toBe('Collision');
    });

    it('cần 1..trần mục có chữ; một mục quá dài ⇒ lỗi', async () => {
      const { coverageItems, coverageItem } = INSURANCE_PRODUCT_LIMITS;
      expect(await errorsOf({ ...valid(), coverageVi: [{ text: ' ' }] })).toContain(
        `coverageItems:${coverageItems.max}`,
      );
      const many = Array.from({ length: coverageItems.max + 1 }, (_, i) => ({ text: `Mục ${i}` }));
      expect(await errorsOf({ ...valid(), coverageEn: many })).toContain(
        `coverageItems:${coverageItems.max}`,
      );
      expect(
        await errorsOf({ ...valid(), coverageVi: [{ text: 'x'.repeat(coverageItem.max + 1) }] }),
      ).toContain(`tooLong:${coverageItem.max}`);
    });
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

  describe('phí thu hộ bảo hiểm (ADR 0091 điều 3)', () => {
    it('bật thì % > 0; % ngoài 0..100 hoặc quá 2 chữ số lẻ ⇒ lỗi', async () => {
      expect(
        await errorsOf({ ...valid(), serviceFeeEnabled: true, serviceFeePercent: 0 }),
      ).toContain('serviceFeePercentRequired');
      expect(await errorsOf({ ...valid(), serviceFeePercent: 100.5 })).toContain(
        'serviceFeePercent:100',
      );
      expect(await errorsOf({ ...valid(), serviceFeePercent: 12.345 })).toContain(
        'serviceFeePercent:100',
      );
      expect(
        await errorsOf({ ...valid(), serviceFeeEnabled: true, serviceFeePercent: 12.5 }),
      ).toEqual([]);
      // Trần 100% (17/11/2026) — đúng trần vẫn hợp lệ.
      expect(
        await errorsOf({ ...valid(), serviceFeeEnabled: true, serviceFeePercent: 100 }),
      ).toEqual([]);
      // Tắt mà % = 0 là trạng thái mặc định hợp lệ.
      expect(await errorsOf(valid())).toEqual([]);
    });

    it('chỉ vật chất xe gửi phí thu hộ lên server', () => {
      const form = { ...valid(), serviceFeeEnabled: true, serviceFeePercent: 10 };
      expect(toUpdateInsuranceProductBody(form, PRODUCT)).toMatchObject({
        serviceFeeEnabled: true,
        serviceFeePercent: 10,
      });
      const ip = { ...PRODUCT, kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT };
      const body = toUpdateInsuranceProductBody(form, ip);
      expect(body).not.toHaveProperty('serviceFeeEnabled');
      expect(body).not.toHaveProperty('serviceFeePercent');
    });
  });

  describe('hoa hồng đại lý (ADR 0097)', () => {
    it('0..100%, tối đa hai chữ số lẻ; gửi lên cùng cấu hình phí của vật chất xe', async () => {
      expect(await errorsOf({ ...valid(), agencyCommissionPercent: 15.25 })).toEqual([]);
      expect(await errorsOf({ ...valid(), agencyCommissionPercent: 100 })).toEqual([]);
      expect(await errorsOf({ ...valid(), agencyCommissionPercent: 100.01 })).toContain(
        'agencyCommissionPercent:100',
      );
      expect(await errorsOf({ ...valid(), agencyCommissionPercent: 1.234 })).toContain(
        'agencyCommissionPercent:100',
      );
      expect(await errorsOf({ ...valid(), agencyCommissionPercent: -1 })).toContain(
        'agencyCommissionPercent:100',
      );
      const body = toUpdateInsuranceProductBody(
        { ...valid(), agencyCommissionPercent: 15 },
        PRODUCT,
      );
      expect(body).toMatchObject({ agencyCommissionPercent: 15 });
      const ip = { ...PRODUCT, kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT };
      expect(toUpdateInsuranceProductBody(valid(), ip)).not.toHaveProperty(
        'agencyCommissionPercent',
      );
    });
  });

  describe('biểu phí theo năm sản xuất, đồng bộ từ hãng (ADR 0106)', () => {
    const TIER_PRODUCT = {
      ...PRODUCT,
      premiumBasis: INSURANCE_PREMIUM_BASIS.VALUE_TIER,
      premiumTiers: [
        { maxDays: 2, percent: '0.013' },
        { maxDays: 5, percent: '0.033' },
      ],
      premiumYearBands: [
        { yearFrom: 2024, yearTo: null, percents: ['0.011', '0.028'] },
        { yearFrom: null, yearTo: 2023, percents: ['0.013', '0.033'] },
      ],
    } as InsuranceProduct;

    it('biểu phí ĐANG ĐỒNG BỘ ⇒ không gửi biểu phí lên (server khoá sửa tay)', () => {
      const locked = { ...TIER_PRODUCT, premiumSyncStatus: 'synced' } as InsuranceProduct;
      const body = toUpdateInsuranceProductBody(insuranceProductFormDefaults(locked), locked);
      expect(body).not.toHaveProperty('premiumTiers');
      expect(body).not.toHaveProperty('premiumYearBands');
    });

    it('lần đồng bộ gần nhất hỏng ⇒ gửi nhóm năm; biểu phí chung mang % của nhóm mới nhất', () => {
      const failed = { ...TIER_PRODUCT, premiumSyncStatus: 'failed' } as InsuranceProduct;
      const form = insuranceProductFormDefaults(failed);
      form.premiumYearBands[0]!.percents = ['0.012', '0.029'];
      const body = toUpdateInsuranceProductBody(form, failed);
      expect(body.premiumYearBands).toEqual([
        { yearFrom: 2024, yearTo: null, percents: ['0.012', '0.029'] },
        { yearFrom: null, yearTo: 2023, percents: ['0.013', '0.033'] },
      ]);
      expect(body.premiumTiers).toEqual([
        { maxDays: 2, percent: '0.012' },
        { maxDays: 5, percent: '0.029' },
      ]);
    });

    it('không có nhóm năm ⇒ gửi null (một biểu phí cho mọi năm)', () => {
      const plain = { ...TIER_PRODUCT, premiumYearBands: null } as InsuranceProduct;
      const body = toUpdateInsuranceProductBody(insuranceProductFormDefaults(plain), plain);
      expect(body.premiumYearBands).toBeNull();
      expect(body.premiumTiers?.[0]).toEqual({ maxDays: 2, percent: '0.013' });
    });

    it('% của nhóm không tăng dần theo bậc ⇒ lỗi biểu phí theo năm', async () => {
      const form = insuranceProductFormDefaults(TIER_PRODUCT);
      expect(await errorsOf(form)).toEqual([]);
      form.premiumYearBands[1]!.percents = ['0.04', '0.033'];
      expect(await errorsOf(form)).toContain('bands');
    });
  });

  describe('tab của form', () => {
    it('mọi sản phẩm có cách tính phí đều có tab giá - kể cả phí theo ngày (ADR 0098)', () => {
      expect(insuranceProductFormTabs(PRODUCT)).toEqual([
        'pricing',
        'content',
        'payout',
        'operation',
      ]);
      const ip = {
        ...PRODUCT,
        kind: INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT,
        premiumBasis: INSURANCE_PREMIUM_BASIS.DAILY,
      };
      expect(insuranceProductFormTabs(ip)).toEqual(['pricing', 'content', 'payout', 'operation']);
    });

    it('phí ngày đi lên dây là chuỗi số nguyên, ô trống là không bán (null)', () => {
      const body = toUpdateInsuranceProductBody({
        ...valid(),
        dailyAmountCar: 20000,
        dailyAmountMotorbike: null,
      });
      expect(body.dailyAmountCar).toBe('20000');
      expect(body.dailyAmountMotorbike).toBeNull();
    });

    it('đếm lỗi theo tab để nhãn tab báo và nút lưu nhảy tới đó', () => {
      expect(
        insuranceProductFormTabErrors({
          premiumTiers: { message: 'x' },
          nameEn: { message: 'x' },
          coverageVi: { message: 'x' },
          certificateUrlTemplate: { message: 'x' },
        }),
      ).toEqual({ pricing: 1, content: 2, payout: 0, operation: 1 });
    });
  });
});
