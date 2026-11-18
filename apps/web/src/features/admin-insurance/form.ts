import * as yup from 'yup';
import {
  INSURANCE_CERTIFICATE_URL_PLACEHOLDER,
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_PREMIUM_SYNC_STATUS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_PRODUCT_LIMITS,
  INSURANCE_REMITTANCE_LIMITS,
  INSURANCE_SERVICE_FEE_PERCENT_MAX,
  INSURANCE_VALUE_TIER_LIMITS,
  insurancePremiumTiersProblem,
  insurancePremiumYearBandsProblem,
  MONEY_STEP_VND,
} from '@xeprime/types';
import { newestBand } from './premium-plan';
import { tabErrorCounts } from '@/lib/form-tabs';
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
  'dailyAmountCar',
  'dailyAmountMotorbike',
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
  /** Biểu phí theo năm sản xuất sai (ADR 0106) — % không hợp lệ hoặc không tăng dần theo bậc. */
  bands: string;
  /** % phí thu hộ ngoài 0..`INSURANCE_SERVICE_FEE_PERCENT_MAX` hoặc quá hai chữ số lẻ. */
  serviceFeePercent: (max: number) => string;
  /** Bật phí thu hộ mà % = 0. */
  serviceFeePercentRequired: string;
  /** % hoa hồng đại lý ngoài 0..trần hoặc quá hai chữ số lẻ (ADR 0097). */
  agencyCommissionPercent: (max: number) => string;
}

/** Trần % hoa hồng đại lý — cùng trần bảng kê và CHECK ở DB. */
export const AGENCY_COMMISSION_PERCENT_MAX = INSURANCE_REMITTANCE_LIMITS.commissionPercentMax;

const twoDecimals = (v: number | null | undefined) =>
  v == null || Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

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
    /* Phí mỗi ngày của sản phẩm tính theo ngày (ADR 0098 — chuyển từ chính sách phí). */
    dailyAmountCar: money(),
    dailyAmountMotorbike: money(),
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
     * Biểu phí theo NĂM SẢN XUẤT (ADR 0106) — rỗng = một biểu phí cho mọi năm. Mỗi nhóm dùng chung
     * mốc ngày của `premiumTiers`; luật là CHÍNH hàm server dùng.
     */
    premiumYearBands: yup
      .array(
        yup.object({
          yearFrom: yup.number().nullable().defined(),
          yearTo: yup.number().nullable().defined(),
          percents: yup.array(yup.string().trim().defined()).defined(),
        }),
      )
      .default([])
      .test('bands', m.bands, function (bands) {
        if (!bands || bands.length === 0) return true;
        const tiers = (
          (this.parent as { premiumTiers?: { maxDays: unknown }[] }).premiumTiers ?? []
        ).map((t) => ({ maxDays: Number(t.maxDays), percent: '1' }));
        return (
          insurancePremiumYearBandsProblem(
            bands.map((b) => ({
              yearFrom: b.yearFrom ?? null,
              yearTo: b.yearTo ?? null,
              percents: b.percents.map((x) => String(x ?? '').trim()),
            })),
            tiers,
          ) === null
        );
      }),
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
      .test('decimals', m.serviceFeePercent(INSURANCE_SERVICE_FEE_PERCENT_MAX), twoDecimals)
      .when('serviceFeeEnabled', {
        is: true,
        then: (s) => s.moreThan(0, m.serviceFeePercentRequired),
      }),
    /*
     * % hoa hồng đại lý theo hợp đồng đại lý với hãng (ADR 0097) — mặc định cho bảng kê tháng.
     * 0..trần bảng kê, hai chữ số lẻ; cùng luật DTO + CHECK ở server.
     */
    agencyCommissionPercent: yup
      .number()
      .required(m.agencyCommissionPercent(AGENCY_COMMISSION_PERCENT_MAX))
      .min(0, m.agencyCommissionPercent(AGENCY_COMMISSION_PERCENT_MAX))
      .max(AGENCY_COMMISSION_PERCENT_MAX, m.agencyCommissionPercent(AGENCY_COMMISSION_PERCENT_MAX))
      .test('decimals', m.agencyCommissionPercent(AGENCY_COMMISSION_PERCENT_MAX), twoDecimals),
  });
}

export type InsuranceProductFormValues = yup.InferType<
  ReturnType<typeof buildInsuranceProductSchema>
>;

/**
 * Các TAB của form sửa sản phẩm và trường thuộc từng tab. Một lỗi ở tab đang khuất phải hiện số
 * lỗi trên nhãn tab và kéo người dùng tới đó khi bấm lưu — không thì nút lưu "không làm gì cả".
 */
export const INSURANCE_PRODUCT_FORM_TAB = {
  PRICING: 'pricing',
  CONTENT: 'content',
  PAYOUT: 'payout',
  OPERATION: 'operation',
} as const;
export type InsuranceProductFormTab =
  (typeof INSURANCE_PRODUCT_FORM_TAB)[keyof typeof INSURANCE_PRODUCT_FORM_TAB];

export const INSURANCE_PRODUCT_FORM_TAB_FIELDS: Record<
  InsuranceProductFormTab,
  readonly (keyof InsuranceProductFormValues)[]
> = {
  pricing: [
    'premiumTiers',
    'premiumYearBands',
    'dailyAmountCar',
    'dailyAmountMotorbike',
    'serviceFeeEnabled',
    'serviceFeePercent',
    'agencyCommissionPercent',
  ],
  content: ['nameVi', 'nameEn', 'coverageVi', 'coverageEn'],
  payout: [
    'deductibleCar',
    'deductibleMotorbike',
    'maxPayoutCar',
    'maxPayoutMotorbike',
    'maxPayoutNoteVi',
    'maxPayoutNoteEn',
  ],
  operation: [
    'isActive',
    'displayOrder',
    'partnerProductCode',
    'certificateUrlTemplate',
    'claimHotline',
  ],
};

/**
 * Tab nào có trong form của sản phẩm này. Tab giá có ở MỌI sản phẩm có cách tính phí: bậc giá trị
 * xe, phí thu hộ, hoặc phí theo ngày (ADR 0098 — phí ngày chuyển từ chính sách phí về sản phẩm).
 */
export function insuranceProductFormTabs(
  product: Pick<InsuranceProduct, 'premiumBasis' | 'kind'> | null | undefined,
): InsuranceProductFormTab[] {
  const pricing =
    product?.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER ||
    product?.premiumBasis === INSURANCE_PREMIUM_BASIS.DAILY ||
    offersServiceFee(product);
  return [
    ...(pricing ? [INSURANCE_PRODUCT_FORM_TAB.PRICING] : []),
    INSURANCE_PRODUCT_FORM_TAB.CONTENT,
    INSURANCE_PRODUCT_FORM_TAB.PAYOUT,
    INSURANCE_PRODUCT_FORM_TAB.OPERATION,
  ];
}

/** Số trường đang lỗi của từng tab (`errors` của RHF — chỉ cần biết khoá nào có mặt). */
export function insuranceProductFormTabErrors(
  errors: Partial<Record<keyof InsuranceProductFormValues, unknown>>,
): Record<InsuranceProductFormTab, number> {
  return tabErrorCounts(INSURANCE_PRODUCT_FORM_TAB_FIELDS, errors);
}

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
    dailyAmountCar: toFormAmount(product.dailyAmountCar),
    dailyAmountMotorbike: toFormAmount(product.dailyAmountMotorbike),
    maxPayoutNoteVi: product.maxPayoutNoteVi ?? '',
    maxPayoutNoteEn: product.maxPayoutNoteEn ?? '',
    partnerProductCode: product.partnerProductCode,
    certificateUrlTemplate: product.certificateUrlTemplate,
    displayOrder: product.displayOrder,
    isActive: product.isActive,
    claimHotline: product.claimHotline ?? '',
    premiumTiers: (product.premiumTiers ?? []).map((t) => ({ ...t })),
    premiumYearBands: (product.premiumYearBands ?? []).map((b) => ({
      yearFrom: b.yearFrom ?? null,
      yearTo: b.yearTo ?? null,
      percents: [...b.percents],
    })),
    serviceFeeEnabled: product.serviceFeeEnabled,
    serviceFeePercent: product.serviceFeePercent,
    agencyCommissionPercent: product.agencyCommissionPercent,
  };
}

/** Payload PATCH — tiền là chuỗi số nguyên đồng (ADR 0007); ô trống = không áp dụng (`null`). */
/** Biểu phí đang ĐỒNG BỘ từ hãng ⇒ khoá sửa tay (ADR 0106 điều 2). */
export function premiumLocked(
  product: Pick<InsuranceProduct, 'premiumSyncStatus'> | null | undefined,
): boolean {
  return product?.premiumSyncStatus === INSURANCE_PREMIUM_SYNC_STATUS.SYNCED;
}

export function toUpdateInsuranceProductBody(
  form: InsuranceProductFormValues,
  product?: Pick<InsuranceProduct, 'premiumBasis' | 'kind' | 'premiumSyncStatus'>,
): UpdateInsuranceProductInput {
  const bands = form.premiumYearBands.map((b) => ({
    yearFrom: b.yearFrom ?? null,
    yearTo: b.yearTo ?? null,
    percents: b.percents.map((x) => String(x ?? '').trim()),
  }));
  // Có nhóm năm ⇒ biểu phí chung mang % của nhóm mới nhất (cùng luật với đồng bộ ở server).
  const newest = bands.length > 0 ? newestBand(bands) : null;
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
    /*
     * Chỉ gửi biểu phí khi sản phẩm tính theo bậc VÀ chưa khoá — biểu phí đồng bộ từ hãng thì server
     * từ chối sửa tay (ADR 0106 điều 2).
     */
    ...(product?.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER && !premiumLocked(product)
      ? {
          premiumTiers: form.premiumTiers.map((t, i) => ({
            maxDays: Number(t.maxDays),
            percent: newest ? (newest.percents[i] ?? '') : String(t.percent).trim(),
          })),
          premiumYearBands: bands.length > 0 ? bands : null,
        }
      : {}),
    // Phí thu hộ chỉ gửi cho vật chất xe — server từ chối bật nó ở sản phẩm khác (ADR 0091 điều 3).
    ...(offersServiceFee(product)
      ? {
          serviceFeeEnabled: form.serviceFeeEnabled,
          serviceFeePercent: form.serviceFeePercent,
          agencyCommissionPercent: form.agencyCommissionPercent,
        }
      : {}),
  };
  for (const field of INSURANCE_MONEY_FIELDS) {
    const value = form[field];
    body[field] = value == null ? null : String(Math.round(value));
  }
  return body;
}
