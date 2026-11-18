'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, InputNumber } from 'antd';
import { useTranslations } from 'next-intl';
import { Controller, useFieldArray, useFormState, useWatch, type Control } from 'react-hook-form';
import { INSURANCE_VALUE_TIER_LIMITS } from '@xeprime/types';
import { useDecimalSeparator } from '@/i18n/use-decimal-separator';
import type { InsuranceProductFormValues } from '../form';
import styles from './InsuranceProductFormDialog.module.css';

/** Trần % một bậc và bước gõ — luật đầy đủ ở `insurancePremiumTiersProblem` (server dùng chung). */
const PERCENT_INPUT = { max: '10', step: '0.001' };

/**
 * Biểu phí BẬC của bảo hiểm vật chất xe (ADR 0088): mỗi hàng "chuyến tối đa N ngày ⇒ phí = X% giá
 * trị xe". Số lấy từ biểu phí MIC (loại xe M1.11), đã gồm VAT. Luật kiểm là CHÍNH hàm server dùng.
 *
 * Dựng dạng LƯỚI có hàng tiêu đề, không phải các `Form.Item` có nhãn riêng: năm hàng cùng hai cột
 * lặp nhãn "Chuyến tối đa / % giá trị xe" năm lần, và nhãn cạnh ô chiếm mất chỗ của chính ô nhập.
 * Cột đầu đọc ra khoảng thời lượng của hàng ("Trên 2 tới 5 ngày") theo số đang gõ.
 */
export function PremiumTiersField({ control }: { control: Control<InsuranceProductFormValues> }) {
  const t = useTranslations('AdminInsurance.form');
  const tPlan = useTranslations('AdminInsurance.plan');
  const decimalSeparator = useDecimalSeparator();
  const { fields, append, remove } = useFieldArray({ control, name: 'premiumTiers' });
  const { errors } = useFormState({ control, name: 'premiumTiers' });
  const watched = useWatch({ control, name: 'premiumTiers' }) ?? [];
  const rootError = errors.premiumTiers?.root?.message ?? errors.premiumTiers?.message;
  const lastDays = Number(watched[watched.length - 1]?.maxDays ?? 0);

  const rangeOf = (index: number) => {
    const to = Number(watched[index]?.maxDays);
    if (!Number.isFinite(to) || to <= 0) return '-';
    const from = index > 0 ? Number(watched[index - 1]?.maxDays) || 0 : 0;
    return from > 0 ? tPlan('durationRange', { from, to }) : tPlan('durationFirst', { to });
  };

  return (
    <div className={styles.tiers}>
      <div className={styles.tierHead} aria-hidden>
        <span>{t('tiers.duration')}</span>
        <span>{t('tiers.maxDays')}</span>
        <span>{t('tiers.percent')}</span>
        <span />
      </div>
      <ol className={styles.tierList} aria-label={t('fields.premiumTiers')}>
        {fields.map((field, index) => {
          const rowErrors = errors.premiumTiers?.[index];
          return (
            <li key={field.id} className={styles.tierRow}>
              <span className={styles.tierRange}>{rangeOf(index)}</span>
              <Controller
                control={control}
                name={`premiumTiers.${index}.maxDays`}
                render={({ field: f }) => (
                  <InputNumber<number>
                    className={styles.tierInput}
                    aria-label={t('tiers.maxDaysAria', { index: index + 1 })}
                    controls={false}
                    precision={0}
                    min={1}
                    max={INSURANCE_VALUE_TIER_LIMITS.maxDays}
                    value={typeof f.value === 'number' ? f.value : null}
                    onChange={(v) => f.onChange(v ?? null)}
                    onBlur={f.onBlur}
                    suffix={t('fields.tierDaysSuffix')}
                    status={rowErrors?.maxDays || rootError ? 'error' : undefined}
                  />
                )}
              />
              <Controller
                control={control}
                name={`premiumTiers.${index}.percent`}
                render={({ field: f }) => (
                  <InputNumber<string>
                    stringMode
                    className={styles.tierInput}
                    aria-label={t('tiers.percentAria', { index: index + 1 })}
                    controls={false}
                    min="0"
                    max={PERCENT_INPUT.max}
                    step={PERCENT_INPUT.step}
                    decimalSeparator={decimalSeparator}
                    value={f.value === '' || f.value == null ? null : String(f.value)}
                    onChange={(v) => f.onChange(v ?? '')}
                    onBlur={f.onBlur}
                    suffix="%"
                    status={rowErrors?.percent || rootError ? 'error' : undefined}
                  />
                )}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined aria-hidden />}
                aria-label={t('actions.removeTier')}
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
              />
            </li>
          );
        })}
      </ol>
      {rootError ? (
        <p className={styles.tierError} role="alert">
          {rootError}
        </p>
      ) : null}
      {fields.length < INSURANCE_VALUE_TIER_LIMITS.maxTiers &&
      lastDays < INSURANCE_VALUE_TIER_LIMITS.maxDays ? (
        <Button
          type="dashed"
          block
          icon={<PlusOutlined aria-hidden />}
          onClick={() =>
            append({
              maxDays: Math.min(INSURANCE_VALUE_TIER_LIMITS.maxDays, lastDays + 1),
              percent: '',
            })
          }
        >
          {t('actions.addTier')}
        </Button>
      ) : null}
    </div>
  );
}
