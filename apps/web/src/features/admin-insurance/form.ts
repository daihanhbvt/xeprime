import * as yup from 'yup';
import {
  INSURANCE_CERTIFICATE_URL_PLACEHOLDER,
  INSURANCE_PRODUCT_LIMITS,
  MONEY_STEP_VND,
} from '@xeprime/types';
import type { InsuranceProduct, UpdateInsuranceProductInput } from './types';

/**
 * Form sửa MỘT sản phẩm bảo hiểm (ADR 0064) — hàm thuần, tách khỏi dialog để test được và để
 * dialog chỉ còn việc bày ô. Biên trường đọc từ `INSURANCE_PRODUCT_LIMITS` (`@xeprime/types`),
 * CHÍNH bảng DTO server dùng; bước tiền là `MONEY_STEP_VND` của luồng tiền v2.
 */

/** Biên thứ tự hiển thị — re-export để ô số dùng cùng con số với schema. */
export const INSURANCE_DISPLAY_ORDER_MIN = INSURANCE_PRODUCT_LIMITS.displayOrder.min;
export const INSURANCE_DISPLAY_ORDER_MAX = INSURANCE_PRODUCT_LIMITS.displayOrder.max;

/** Trần một ô tiền: `amountMaxDigits` chữ số nguyên đồng (mẫu tiền của DTO). */
const AMOUNT_MAX = 10 ** INSURANCE_PRODUCT_LIMITS.amountMaxDigits - 1;

export const INSURANCE_MONEY_FIELDS = [
  'deductibleCar',
  'deductibleMotorbike',
  'maxPayoutCar',
  'maxPayoutMotorbike',
] as const;

/** Mẫu URL GCN hợp lệ: https, không khoảng trắng, có chỗ thay số chứng nhận. */
export function isCertificateUrlTemplate(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^https:\/\/\S+$/.test(value) &&
    value.includes(INSURANCE_CERTIFICATE_URL_PLACEHOLDER)
  );
}

/** Thông điệp lỗi — dialog truyền `t()` vào, form.ts không biết ngôn ngữ. */
export interface InsuranceProductFormMessages {
  required: string;
  tooShort: (min: number) => string;
  tooLong: (max: number) => string;
  amountMin: string;
  amountStep: string;
  amountMax: string;
  urlTemplate: string;
  displayOrder: (min: number, max: number) => string;
}

export function buildInsuranceProductSchema(m: InsuranceProductFormMessages) {
  const text = ({ min, max }: { min: number; max: number }) =>
    yup.string().trim().required(m.required).min(min, m.tooShort(min)).max(max, m.tooLong(max));
  const money = () =>
    yup
      .number()
      .nullable()
      .defined()
      .test('min', m.amountMin, (v) => v == null || v >= 0)
      .test('max', m.amountMax, (v) => v == null || v <= AMOUNT_MAX)
      .test('step', m.amountStep, (v) => v == null || v % MONEY_STEP_VND === 0);
  const note = () =>
    yup
      .string()
      .trim()
      .max(
        INSURANCE_PRODUCT_LIMITS.maxPayoutNote.max,
        m.tooLong(INSURANCE_PRODUCT_LIMITS.maxPayoutNote.max),
      )
      .default('');
  const { displayOrder, certificateUrlTemplate } = INSURANCE_PRODUCT_LIMITS;

  return yup.object({
    nameVi: text(INSURANCE_PRODUCT_LIMITS.name),
    nameEn: text(INSURANCE_PRODUCT_LIMITS.name),
    coverageVi: text(INSURANCE_PRODUCT_LIMITS.coverage),
    coverageEn: text(INSURANCE_PRODUCT_LIMITS.coverage),
    deductibleCar: money(),
    deductibleMotorbike: money(),
    maxPayoutCar: money(),
    maxPayoutMotorbike: money(),
    maxPayoutNoteVi: note(),
    maxPayoutNoteEn: note(),
    partnerProductCode: text(INSURANCE_PRODUCT_LIMITS.partnerProductCode),
    certificateUrlTemplate: yup
      .string()
      .trim()
      .required(m.required)
      .max(certificateUrlTemplate.max, m.tooLong(certificateUrlTemplate.max))
      .test('template', m.urlTemplate, isCertificateUrlTemplate),
    displayOrder: yup
      .number()
      .required(m.required)
      .integer(m.displayOrder(displayOrder.min, displayOrder.max))
      .min(displayOrder.min, m.displayOrder(displayOrder.min, displayOrder.max))
      .max(displayOrder.max, m.displayOrder(displayOrder.min, displayOrder.max)),
    isActive: yup.boolean().required(),
  });
}

export type InsuranceProductFormValues = yup.InferType<
  ReturnType<typeof buildInsuranceProductSchema>
>;

/** Tiền trên dây là chuỗi số nguyên đồng; ô số trên form là `number`. Chỉ để HIỂN THỊ trong ô. */
const toFormAmount = (value: string | null | undefined) => (value == null ? null : Number(value));

export function insuranceProductFormDefaults(
  product: InsuranceProduct,
): InsuranceProductFormValues {
  return {
    nameVi: product.nameVi,
    nameEn: product.nameEn,
    coverageVi: product.coverageVi,
    coverageEn: product.coverageEn,
    deductibleCar: toFormAmount(product.deductibleCar),
    deductibleMotorbike: toFormAmount(product.deductibleMotorbike),
    maxPayoutCar: toFormAmount(product.maxPayoutCar),
    maxPayoutMotorbike: toFormAmount(product.maxPayoutMotorbike),
    maxPayoutNoteVi: product.maxPayoutNoteVi ?? '',
    maxPayoutNoteEn: product.maxPayoutNoteEn ?? '',
    partnerProductCode: product.partnerProductCode,
    certificateUrlTemplate: product.certificateUrlTemplate,
    displayOrder: product.displayOrder,
    isActive: product.isActive,
  };
}

/** Payload PATCH — tiền là chuỗi số nguyên đồng (ADR 0007); ô trống = không áp dụng (`null`). */
export function toUpdateInsuranceProductBody(
  form: InsuranceProductFormValues,
): UpdateInsuranceProductInput {
  const body: UpdateInsuranceProductInput = {
    nameVi: form.nameVi,
    nameEn: form.nameEn,
    coverageVi: form.coverageVi,
    coverageEn: form.coverageEn,
    maxPayoutNoteVi: form.maxPayoutNoteVi || null,
    maxPayoutNoteEn: form.maxPayoutNoteEn || null,
    partnerProductCode: form.partnerProductCode,
    certificateUrlTemplate: form.certificateUrlTemplate,
    displayOrder: form.displayOrder,
    isActive: form.isActive,
  };
  for (const field of INSURANCE_MONEY_FIELDS) {
    const value = form[field];
    body[field] = value == null ? null : String(Math.round(value));
  }
  return body;
}
