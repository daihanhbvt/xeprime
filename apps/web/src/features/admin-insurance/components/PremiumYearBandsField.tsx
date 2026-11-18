'use client';

import { InputNumber } from 'antd';
import { useTranslations } from 'next-intl';
import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';
import { useDecimalSeparator } from '@/i18n/use-decimal-separator';
import { useAppFormat } from '@/i18n/use-app-format';
import type { InsuranceProductFormValues } from '../form';
import { previousTierDays } from '../premium-plan';
import { useYearBandLabel } from './year-band-label';
import styles from './PremiumYearBandsField.module.css';

/** Trần % một bậc và bước gõ — luật đầy đủ ở `insurancePremiumYearBandsProblem` (server dùng chung). */
const PERCENT_INPUT = { max: '10', step: '0.001' };

/**
 * Biểu phí theo NĂM SẢN XUẤT (ADR 0106): mỗi hàng là một nhóm năm, mỗi cột một bậc thời lượng, ô là
 * % giá trị xe. Nhóm năm và mốc ngày đến từ lần đồng bộ với hãng gần nhất — form chỉ cho sửa %, và
 * chỉ khi biểu phí CHƯA khoá (lần đồng bộ gần nhất hỏng). `readOnly` = biểu phí đang khoá.
 */
export function PremiumYearBandsField({
  control,
  readOnly,
}: {
  control: Control<InsuranceProductFormValues>;
  readOnly: boolean;
}) {
  const t = useTranslations('AdminInsurance.bands');
  const tPlan = useTranslations('AdminInsurance.plan');
  const fmt = useAppFormat();
  const decimalSeparator = useDecimalSeparator();
  const yearBandLabel = useYearBandLabel();
  const tiers = useWatch({ control, name: 'premiumTiers' }) ?? [];
  const bands = useWatch({ control, name: 'premiumYearBands' }) ?? [];
  const { errors } = useFormState({ control, name: 'premiumYearBands' });
  const rootError = errors.premiumYearBands?.root?.message ?? errors.premiumYearBands?.message;
  const days = tiers.map((tier) => ({ maxDays: Number(tier.maxDays), percent: '' }));

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <table className={styles.grid} aria-label={t('tableLabel')}>
          <thead>
            <tr>
              <th scope="col" className={styles.yearHead}>
                {t('columns.year')}
              </th>
              {days.map((tier, index) => {
                const from = previousTierDays(days, index);
                return (
                  <th key={tier.maxDays} scope="col" className={styles.tierHead}>
                    {from === 0
                      ? tPlan('durationFirst', { to: tier.maxDays })
                      : tPlan('durationRange', { from, to: tier.maxDays })}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {bands.map((band, bandIndex) => {
              const label = yearBandLabel(band.yearFrom ?? null, band.yearTo ?? null);
              return (
                <tr key={`${band.yearFrom ?? 'min'}-${band.yearTo ?? 'max'}`}>
                  <th scope="row" className={styles.yearCell}>
                    {label}
                  </th>
                  {days.map((tier, tierIndex) => (
                    <td key={tier.maxDays} className={styles.cell}>
                      {readOnly ? (
                        <span className={styles.readOnly}>
                          {t('percent', {
                            percent: fmt.rate(band.percents[tierIndex] ?? '0'),
                          })}
                        </span>
                      ) : (
                        <Controller
                          control={control}
                          name={`premiumYearBands.${bandIndex}.percents.${tierIndex}`}
                          render={({ field: f }) => (
                            <InputNumber<string>
                              stringMode
                              className={styles.input}
                              aria-label={t('percentAria', { years: label, days: tier.maxDays })}
                              controls={false}
                              min="0"
                              max={PERCENT_INPUT.max}
                              step={PERCENT_INPUT.step}
                              decimalSeparator={decimalSeparator}
                              value={f.value === '' || f.value == null ? null : String(f.value)}
                              onChange={(v) => f.onChange(v ?? '')}
                              onBlur={f.onBlur}
                              suffix="%"
                              status={rootError ? 'error' : undefined}
                            />
                          )}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rootError ? (
        <p className={styles.error} role="alert">
          {rootError}
        </p>
      ) : null}
    </div>
  );
}
