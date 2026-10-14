import type { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  PLAN_GUIDE_TEMPLATE_BODY_MAX,
  PLAN_GUIDE_TEMPLATE_CODE_PATTERN,
  PLAN_GUIDE_TEMPLATE_SUBJECT_MAX,
  PLAN_GUIDE_VARIANT,
  PLAN_GUIDE_VARIANT_VALUES,
  type PlanGuideVariant,
} from '@xeprime/types';
import type { PlanGuideTemplate, PlanGuideVariantContent } from '../types';

/** Trần tên bộ mẫu — khớp `@MaxLength(120)` của DTO API. */
export const TEMPLATE_NAME_MAX = 120;

/** Mã bộ mẫu chuẩn hoá ngay khi gõ: chữ thường, khoảng trắng → gạch ngang. */
export const normalizeTemplateCode = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, '-');

export interface VariantFormValues {
  subjectVi: string;
  subjectEn: string;
  bodyVi: string;
  bodyEn: string;
}

/** Form bộ mẫu: nội dung khoá theo biến thể (đường dẫn RHF `variants.<variant>.<field>`). */
export interface TemplateFormValues {
  code: string;
  name: string;
  variants: Record<PlanGuideVariant, VariantFormValues>;
}

const EMPTY_VARIANT: VariantFormValues = { subjectVi: '', subjectEn: '', bodyVi: '', bodyEn: '' };

const variantRecord = (pick: (v: PlanGuideVariant) => VariantFormValues) =>
  Object.fromEntries(PLAN_GUIDE_VARIANT_VALUES.map((v) => [v, pick(v)])) as Record<
    PlanGuideVariant,
    VariantFormValues
  >;

export const EMPTY_TEMPLATE_FORM: TemplateFormValues = {
  code: '',
  name: '',
  variants: variantRecord(() => ({ ...EMPTY_VARIANT })),
};

export function templateToForm(template: PlanGuideTemplate): TemplateFormValues {
  const byVariant = new Map(template.variants.map((v) => [v.variant, v]));
  return {
    code: template.code,
    name: template.name,
    variants: variantRecord((variant) => {
      const v = byVariant.get(variant);
      return v
        ? { subjectVi: v.subjectVi, subjectEn: v.subjectEn, bodyVi: v.bodyVi, bodyEn: v.bodyEn }
        : { ...EMPTY_VARIANT };
    }),
  };
}

/** Record form → mảng đi trên dây (đủ bốn biến thể, theo thứ tự chuẩn). */
export const formVariantsToList = (
  variants: TemplateFormValues['variants'],
): PlanGuideVariantContent[] =>
  PLAN_GUIDE_VARIANT_VALUES.map((variant) => ({ variant, ...variants[variant] }));

/** Biến thể đầu tiên có lỗi — để nhảy tab khi submit trượt. */
export const firstVariantWithError = (
  errors: Partial<Record<PlanGuideVariant, unknown>> | undefined,
): PlanGuideVariant | null => PLAN_GUIDE_VARIANT_VALUES.find((v) => errors?.[v]) ?? null;

type Translate = ReturnType<typeof useTranslations<'AdminAppConfig'>>;

/** Schema form soạn bộ mẫu — cùng trần với DTO API (hằng số dùng chung từ `@xeprime/types`). */
export function buildTemplateSchema(t: Translate) {
  const subject = yup
    .string()
    .trim()
    .required(t('editor.validation.subjectRequired'))
    .max(
      PLAN_GUIDE_TEMPLATE_SUBJECT_MAX,
      t('editor.validation.subjectTooLong', { max: PLAN_GUIDE_TEMPLATE_SUBJECT_MAX }),
    );
  const body = yup
    .string()
    .trim()
    .required(t('editor.validation.bodyRequired'))
    .max(
      PLAN_GUIDE_TEMPLATE_BODY_MAX,
      t('editor.validation.bodyTooLong', { max: PLAN_GUIDE_TEMPLATE_BODY_MAX }),
    );
  const variant = yup.object({ subjectVi: subject, subjectEn: subject, bodyVi: body, bodyEn: body });
  return yup.object({
    code: yup
      .string()
      .trim()
      .required(t('editor.validation.codeRequired'))
      .matches(PLAN_GUIDE_TEMPLATE_CODE_PATTERN, t('editor.validation.codeFormat')),
    name: yup
      .string()
      .trim()
      .required(t('editor.validation.nameRequired'))
      .max(TEMPLATE_NAME_MAX, t('editor.validation.nameTooLong', { max: TEMPLATE_NAME_MAX })),
    variants: yup
      .object({
        [PLAN_GUIDE_VARIANT.WELCOME]: variant,
        [PLAN_GUIDE_VARIANT.EXPIRING]: variant,
        [PLAN_GUIDE_VARIANT.EXPIRED]: variant,
        [PLAN_GUIDE_VARIANT.GRACE]: variant,
      })
      .required(),
  });
}
