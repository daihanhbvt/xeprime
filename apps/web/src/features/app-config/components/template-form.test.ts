import { describe, expect, it } from 'vitest';
import { PLAN_GUIDE_VARIANT, PLAN_GUIDE_VARIANT_VALUES } from '@xeprime/types';
import type { PlanGuideTemplate } from '../types';
import {
  EMPTY_TEMPLATE_FORM,
  buildTemplateSchema,
  firstVariantWithError,
  formVariantsToList,
  normalizeTemplateCode,
  templateToForm,
} from './template-form';

const t = ((key: string) => key) as unknown as Parameters<typeof buildTemplateSchema>[0];

const content = (v: string) => ({
  subjectVi: `vi ${v}`,
  subjectEn: `en ${v}`,
  bodyVi: `<p>${v}</p>`,
  bodyEn: `<p>${v}</p>`,
});

describe('template-form', () => {
  it('templateToForm khoá theo biến thể; biến thể thiếu thành rỗng', () => {
    const template = {
      id: 'x',
      code: 'c',
      name: 'n',
      variants: [{ variant: PLAN_GUIDE_VARIANT.GRACE, ...content('grace') }],
    } as unknown as PlanGuideTemplate;
    const form = templateToForm(template);
    expect(form.variants.grace.subjectVi).toBe('vi grace');
    expect(form.variants.welcome).toEqual({ subjectVi: '', subjectEn: '', bodyVi: '', bodyEn: '' });
  });

  it('formVariantsToList trả đủ bốn biến thể theo thứ tự chuẩn', () => {
    const list = formVariantsToList(EMPTY_TEMPLATE_FORM.variants);
    expect(list.map((v) => v.variant)).toEqual(PLAN_GUIDE_VARIANT_VALUES);
  });

  it('firstVariantWithError chọn biến thể lỗi đầu tiên theo thứ tự tab', () => {
    expect(firstVariantWithError({ grace: {}, expiring: {} })).toBe(PLAN_GUIDE_VARIANT.EXPIRING);
    expect(firstVariantWithError(undefined)).toBeNull();
  });

  it('schema bắt buộc đủ nội dung ở MỌI biến thể', async () => {
    const schema = buildTemplateSchema(t);
    const full = {
      code: 'abc',
      name: 'Bộ',
      variants: Object.fromEntries(PLAN_GUIDE_VARIANT_VALUES.map((v) => [v, content(v)])),
    };
    await expect(schema.validate(full)).resolves.toBeDefined();
    const missing = { ...full, variants: { ...full.variants, expired: { ...content('x'), bodyEn: ' ' } } };
    await expect(schema.validate(missing)).rejects.toThrow('editor.validation.bodyRequired');
  });

  it('normalizeTemplateCode: chữ thường, khoảng trắng thành gạch ngang', () => {
    expect(normalizeTemplateCode('Summer  Promo')).toBe('summer-promo');
  });
});
