'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { ReviewRow, ReviewValue } from '../review-rows';
import styles from './VehicleApprovalDrawer.module.css';

/**
 * Lưới nhãn–giá trị CHỈ ĐỌC của hồ sơ duyệt — không phải ô nhập bị khoá.
 *
 * `<dl>` thật: trình đọc màn hình đọc từng cặp "Biển số: 75A-123.45" thay vì một chuỗi ô vô danh.
 * Lưới tự dàn 2 cột khi đủ chỗ, 1 cột khi hẹp (CSS `auto-fill`), không có nhánh JS theo màn hình.
 */
export function ReviewFieldGrid({ rows }: { rows: readonly ReviewRow[] }) {
  const t = useTranslations('Approvals');
  const tFields = useTranslations('Approvals.fields');
  const domainLabel = useDomainLabel();
  const format = useReviewValueFormatter();

  if (rows.length === 0) return null;

  return (
    <dl className={styles.grid}>
      {rows.map((row) => {
        const label = tFields(row.label);
        return (
          <div key={row.id} className={cx(styles.gridItem, row.wide && styles.gridItemWide)}>
            <dt className={styles.gridLabel}>
              {row.service
                ? t('fieldForService', {
                    label,
                    service: domainLabel('serviceType', row.service),
                  })
                : label}
            </dt>
            <dd className={cx(styles.gridValue, row.wide && styles.gridValueText)}>
              {format(row.value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Định dạng MỘT giá trị theo loại của nó — tiền, số đo, công tắc, nhãn nghiệp vụ… */
function useReviewValueFormatter(): (value: ReviewValue) => ReactNode {
  const t = useTranslations('Approvals');
  const fmt = useAppFormat();
  const numbers = useFormatter();
  const domainLabel = useDomainLabel();
  const { brandLabel } = useCatalogLabels();

  const decimal = (value: string | number) =>
    numbers.number(Number(value), { maximumFractionDigits: 2 });

  return function formatReviewValue(value) {
    switch (value.kind) {
      case 'text':
        return value.text;
      case 'domain':
        return domainLabel(value.group, value.code);
      case 'domainList':
        return value.codes.map((code) => domainLabel(value.group, code)).join(' · ');
      case 'brand':
        return brandLabel(value.code) ?? value.code;
      case 'money': {
        if (value.per === 'day') return fmt.pricePerDay(value.amount);
        if (value.per === 'hour') return fmt.pricePerHour(value.amount);
        if (value.per === 'month') return fmt.pricePerMonth(value.amount);
        if (value.per === 'km') return t('units.perKm', { price: fmt.money(value.amount) });
        return fmt.money(value.amount);
      }
      case 'percent':
        return t('units.percent', { value: value.value });
      case 'toggle':
        return value.on ? t('values.on') : t('values.off');
      case 'unlimited':
        return t('values.unlimited');
      case 'measure':
        return t(`units.${value.unit}`, { value: decimal(value.value) });
      case 'deliveryTiers':
        return (
          <ul className={styles.inlineList}>
            {value.tiers.map((tier) => (
              <li key={tier.toKm}>
                {t('values.tier', {
                  from: decimal(tier.fromKm),
                  to: decimal(tier.toKm),
                  fee: tier.free ? t('values.free') : fmt.money(tier.fee),
                })}
              </li>
            ))}
          </ul>
        );
      case 'longTermTiers':
        return (
          <ul className={styles.inlineList}>
            {value.tiers.map((tier) => (
              <li key={tier.minMonths}>
                {t('values.longTermTier', {
                  months: fmt.packageLabel(tier.minMonths) ?? String(tier.minMonths),
                  percent: tier.percent,
                })}
              </li>
            ))}
          </ul>
        );
    }
  };
}
