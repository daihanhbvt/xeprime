'use client';

import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import {
  TAX_CATEGORY_BY_SERVICE_TYPE,
  taxRateTotalPercent,
  type TaxCategory,
  type TaxRatesByServiceType,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import {
  TAX_PIT_PERCENT_MAX,
  TAX_SERVICE_TYPES,
  TAX_VAT_PERCENT_MAX,
  taxRateRowTotal,
  type FeePolicyFormValues,
} from '../form';
import { useFeePolicyFormat } from '../hooks/use-fee-policy-format';
import styles from './TaxRatesTable.module.css';

/**
 * Bảng mức khấu trừ thuế theo LOẠI DỊCH VỤ — ADR 0068 điều 1 & 7: ba dòng tự lái · dài hạn · có tài
 * xế, mỗi dòng GTGT % + TNCN %, cột "Cộng" tự tính. Hai bản: SOẠN (`TaxRatesField`, trong form nháp)
 * và ĐỌC (`TaxRatesView`, panel chi tiết) — cùng một khung để admin nhìn một bảng ở cả hai nơi.
 */
export function TaxRatesField({ control }: { control: Control<FeePolicyFormValues> }) {
  const t = useTranslations('FeePolicies.form');
  const tLabels = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();
  const pf = useFeePolicyFormat();
  const rates = useWatch({ control, name: 'taxRates' });

  return (
    <div className={styles.table} role="group" aria-label={t('taxRatesTitle')}>
      <Head />
      {TAX_SERVICE_TYPES.map((type) => {
        const service = domainLabel('serviceType', type);
        const total = taxRateRowTotal(rates?.[type]);
        return (
          <div key={type} className={styles.row}>
            <ServiceCell service={service} category={TAX_CATEGORY_BY_SERVICE_TYPE[type]} />
            <NumberField
              control={control}
              name={`taxRates.${type}.vatPercent`}
              label={t('taxVatLabel', { service })}
              percent
              min={0}
              max={TAX_VAT_PERCENT_MAX}
              precision={2}
            />
            <NumberField
              control={control}
              name={`taxRates.${type}.pitPercent`}
              label={t('taxPitLabel', { service })}
              percent
              min={0}
              max={TAX_PIT_PERCENT_MAX}
              precision={2}
            />
            <span className={styles.total} aria-live="polite">
              {total == null ? tLabels('emptyValue') : pf.percent(total)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Bản CHỈ ĐỌC của bảng mức — panel chi tiết một phiên bản. */
export function TaxRatesView({ rates }: { rates: TaxRatesByServiceType }) {
  const t = useTranslations('FeePolicies.form');
  const domainLabel = useDomainLabel();
  const pf = useFeePolicyFormat();

  return (
    <div className={styles.table} role="table" aria-label={t('taxRatesTitle')}>
      <Head />
      {TAX_SERVICE_TYPES.map((type) => (
        <div key={type} className={styles.row} role="row">
          <ServiceCell
            service={domainLabel('serviceType', type)}
            category={TAX_CATEGORY_BY_SERVICE_TYPE[type]}
          />
          <span className={styles.value} role="cell">
            {pf.percent(rates[type].vatPercent)}
          </span>
          <span className={styles.value} role="cell">
            {pf.percent(rates[type].pitPercent)}
          </span>
          <span className={styles.total} role="cell">
            {pf.percent(taxRateTotalPercent(rates[type]))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Head() {
  const t = useTranslations('FeePolicies.form');
  return (
    <div className={styles.head} role="row">
      <span role="columnheader">{t('taxHeadService')}</span>
      <span role="columnheader">{t('taxHeadVat')}</span>
      <span role="columnheader">{t('taxHeadPit')}</span>
      <span role="columnheader" className={styles.totalHead}>
        {t('taxHeadTotal')}
      </span>
    </div>
  );
}

function ServiceCell({ service, category }: { service: string; category: TaxCategory }) {
  const t = useTranslations('FeePolicies.form');
  return (
    <span className={styles.service} role="rowheader">
      <span>{service}</span>
      <span className={styles.category}>{t(`taxCategory.${category}`)}</span>
    </span>
  );
}
