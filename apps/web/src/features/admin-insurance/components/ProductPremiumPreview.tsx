'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { InsurancePremiumTier } from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { MoneyInput } from '@/components/form/MoneyInput';
import { premiumPlan, type PremiumPlanConfig } from '../premium-plan';
import { PremiumPlanTable } from './PremiumPlanTable';
import styles from './InsuranceProductFormDialog.module.css';

/** Xe mẫu khi mở form — một chiếc phổ thông, admin gõ đè. */
const SAMPLE_VALUE = 500_000_000;

/**
 * Xem trước bảng phí theo số ĐANG SỬA trong form sản phẩm (ADR 0097): đổi một % là thấy ngay khách
 * trả, MIC nhận và XePrime giữ lại bao nhiêu, trước khi lưu.
 *
 * Không phải `PremiumCalculatorCard`: thẻ đó có `<form>` riêng (lồng form trong form là HTML sai và
 * Enter gửi nhầm form ngoài), và nút "Đối chiếu với MIC" không có nghĩa khi bảng bậc chưa lưu.
 * Ô giá trị xe ở đây là state cục bộ, không thuộc form sản phẩm.
 */
export function ProductPremiumPreview({ config }: { config: PremiumPlanConfig | null }) {
  const t = useTranslations('AdminInsurance.form.preview');
  const tCalc = useTranslations('AdminInsurance.calculator');
  const id = useId();
  const [value, setValue] = useState<number | null>(SAMPLE_VALUE);
  const rows =
    config && value != null && value > 0 ? premiumPlan(String(Math.trunc(value)), config) : null;

  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHead}>
        <h3 id={`${id}-title`} className={styles.sectionTitle}>
          {t('title')}
        </h3>
        <InfoHint content={t('hint')} label={t('hintLabel')} />
      </div>
      <label className={styles.previewLabel} htmlFor={`${id}-value`}>
        {t('sampleValue')}
      </label>
      <MoneyInput
        id={`${id}-value`}
        className={styles.previewInput}
        value={value}
        min={0}
        onChange={(next) => setValue(next ?? null)}
      />
      {!config ? (
        <p className={styles.muted}>{t('invalidTiers')}</p>
      ) : rows ? (
        <PremiumPlanTable
          tiers={config.tiers as readonly InsurancePremiumTier[]}
          rows={rows}
          label={tCalc('tableLabel')}
          compact
        />
      ) : (
        <p className={styles.muted}>{tCalc('enterValue')}</p>
      )}
    </section>
  );
}
