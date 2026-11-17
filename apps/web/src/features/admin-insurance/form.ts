import * as yup from 'yup';
import {
  INSURANCE_CERTIFICATE_URL_PLACEHOLDER,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PRODUCT_LIMITS,
  INSURANCE_SERVICE_FEE_PERCENT_MAX,
  INSURANCE_VALUE_TIER_LIMITS,
  insurancePremiumTiersProblem,
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
  /** Biểu phí bậc sai (ADR 0088) — câu từ `insurancePremiumTiersProblem` không hiện cho admin. */
  tiers: string;
  /** % phí thu hộ ngoài 0..`INSURANCE_SERVICE_FEE_PERCENT_MAX` hoặc quá hai chữ số lẻ. */
  serviceFeePercent: (max: number) => string;
  /** Bật phí thu hộ mà % = 0. */
  serviceFeePercentRequired: string;
}

/** Phí thu hộ bảo hiểm chỉ có ở bảo hiểm VẬT CHẤT XE (ADR 0091 điều 3) — cùng luật CHECK ở DB. */
export function offersServiceFee(product: Pick<InsuranceProduct, 'kind'> | null | undefined) {
  return product?.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP;
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
    claimHotline: yup
      .string()
      .trim()
      .max(
        INSURANCE_VALUE_TIER_LIMITS.claimHotline.max,
        m.tooLong(INSURANCE_VALUE_TIER_LIMITS.claimHotline.max),
      )
      .default(''),
    /*
     * Biểu phí bậc (ADR 0088) — chỉ có hàng khi sản phẩm tính theo bậc; rỗng với sản phẩm theo ngày.
     * Luật (tăng dần ngặt, 1-30 ngày, % ≤ 10, 4 chữ số lẻ) là CHÍNH hàm server dùng.
     */
    premiumTiers: yup
      .array(
        yup.object({
          maxDays: yup.number().required(m.required),
          percent: yup.string().trim().required(m.required),
        }),
      )
      .default([])
      .test('tiers', m.tiers, (tiers) =>
        !tiers || tiers.length === 0
          ? true
          : insurancePremiumTiersProblem(
              tiers.map((t) => ({ maxDays: Number(t.maxDays), percent: String(t.percent).trim() })),
            ) === null,
      ),
    /*
     * Phí thu hộ bảo hiểm của nền tảng (ADR 0091 điều 3) — % trên `IV`, 0..50, hai chữ số lẻ; bật thì
     * % > 0. Cùng luật DTO + CHECK `insurance_products_service_fee_*` ở server.
     */
    serviceFeeEnabled: yup.boolean().required(),
    serviceFeePercent: yup
      .number()
      .required(m.serviceFeePercent(INSURANCE_SERVICE_FEE_PERCENT_MAX))
      .min(0, m.serviceFeePercent(INSURANCE_SERVICE_FEE_PERCENT_MAX))
      .max(
        INSURANCE_SERVICE_FEE_PERCENT_MAX,
        m.serviceFeePercent(INSURANCE_SERVICE_FEE_PERCENT_MAX),
      )
      .test(
        'decimals',
        m.serviceFeePercent(INSURANCE_SERVICE_FEE_PERCENT_MAX),
        (v) => v == null || Math.abs(Math.round(v * 100) - v * 100) < 1e-6,
      )
      .when('serviceFeeEnabled', {
        is: true,
        then: (s) => s.moreThan(0, m.serviceFeePercentRequired),
      }),
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
    claimHotline: product.claimHotline ?? '',
    premiumTiers: (product.premiumTiers ?? []).map((t) => ({ ...t })),
    serviceFeeEnabled: product.serviceFeeEnabled,
    serviceFeePercent: product.serviceFeePercent,
  };
}

/** Payload PATCH — tiền là chuỗi số nguyên đồng (ADR 0007); ô trống = không áp dụng (`null`). */
export function toUpdateInsuranceProductBody(
  form: InsuranceProductFormValues,
  product?: Pick<InsuranceProduct, 'premiumBasis' | 'kind'>,
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
    claimHotline: form.claimHotline.trim() || null,
    // Chỉ gửi biểu phí khi sản phẩm tính theo bậc — sản phẩm theo ngày không có biểu phí bậc.
    ...(product?.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER
      ? {
          premiumTiers: form.premiumTiers.map((t) => ({
            maxDays: Number(t.maxDays),
            percent: String(t.percent).trim(),
          })),
        }
      : {}),
    // Phí thu hộ chỉ gửi cho vật chất xe — server từ chối bật nó ở sản phẩm khác (ADR 0091 điều 3).
    ...(offersServiceFee(product)
      ? { serviceFeeEnabled: form.serviceFeeEnabled, serviceFeePercent: form.serviceFeePercent }
      : {}),
  };
  for (const field of INSURANCE_MONEY_FIELDS) {
    const value = form[field];
    body[field] = value == null ? null : String(Math.round(value));
  }
  return body;
}
