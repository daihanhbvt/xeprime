'use client';

import { useTranslations } from 'next-intl';
import type { InsurancePremiumTier } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { previousTierDays, type PremiumPlanRow } from '../premium-plan';
import type { InsurancePremiumCheckResult } from '../types';
import styles from './PremiumPlanTable.module.css';

type CheckRow = InsurancePremiumCheckResult['rows'][number];

const COMPACT_COLUMNS = new Set(['duration', 'customerPays', 'netToPartner', 'platformEarns']);

/**
 * Bảng phí theo từng bậc của một giá trị xe (ADR 0097): phí MIC · phí thu hộ · khách trả · hoa hồng
 * đại lý · chuyển MIC · XePrime giữ lại. Có `check` thì thêm hai cột "MIC báo" và "Lệch" của lượt
 * đối chiếu với hãng. Bảng nhỏ (≤ 10 bậc) nên không phân trang.
 */
export function PremiumPlanTable({
  tiers,
  rows,
  check,
  label,
  compact = false,
}: {
  tiers: readonly InsurancePremiumTier[];
  rows: readonly PremiumPlanRow[];
  check?: InsurancePremiumCheckResult | null;
  label: string;
  /**
   * Bốn cột (thời lượng · khách trả · chuyển MIC · XePrime giữ lại) — khung xem trước hẹp của form
   * sản phẩm. Ba cột ẩn đi là thành phần của ba cột còn lại, không mất thông tin quyết định.
   */
  compact?: boolean;
}) {
  const t = useTranslations('AdminInsurance.plan');
  const tReason = useTranslations('AdminInsurance.drawer.pricing.fallbackReasons');
  const fmt = useAppFormat();
  const checkByDays = new Map<number, CheckRow>((check?.rows ?? []).map((r) => [r.maxDays, r]));
  const money = (value: string) => <span className={styles.amount}>{fmt.money(value)}</span>;

  const allColumns: DataTableColumn<PremiumPlanRow>[] = [
    {
      title: t('columns.duration'),
      key: 'duration',
      render: (_, row) => {
        const index = tiers.findIndex((tier) => tier.maxDays === row.maxDays);
        const from = previousTierDays(tiers, index);
        return (
          <div className={styles.stack}>
            <span className={styles.strong}>
              {from === 0
                ? t('durationFirst', { to: row.maxDays })
                : t('durationRange', { from, to: row.maxDays })}
            </span>
            <span className={styles.muted}>
              {t('percentOfValue', { percent: fmt.rate(row.percent) })}
            </span>
          </div>
        );
      },
    },
    {
      title: t('columns.premium'),
      key: 'premium',
      align: 'right',
      render: (_, r) => money(r.premium),
    },
    {
      title: t('columns.serviceFee'),
      key: 'serviceFee',
      align: 'right',
      render: (_, r) => money(r.serviceFee),
    },
    {
      title: t('columns.customerPays'),
      key: 'customerPays',
      align: 'right',
      render: (_, r) => <strong className={styles.amount}>{fmt.money(r.customerPays)}</strong>,
    },
    {
      title: t('columns.commission'),
      key: 'commission',
      align: 'right',
      render: (_, r) => money(r.commission),
    },
    {
      title: t('columns.netToPartner'),
      key: 'netToPartner',
      align: 'right',
      render: (_, r) => money(r.netToPartner),
    },
    {
      title: t('columns.platformEarns'),
      key: 'platformEarns',
      align: 'right',
      render: (_, r) => <strong className={styles.earn}>{fmt.money(r.platformEarns)}</strong>,
    },
    ...(check
      ? ([
          {
            title: t('columns.partnerQuote'),
            key: 'partnerQuote',
            align: 'right',
            render: (_, r) => {
              const c = checkByDays.get(r.maxDays);
              if (!c) return <span className={styles.muted}>-</span>;
              return c.partnerPremium ? (
                money(c.partnerPremium)
              ) : (
                <span className={styles.warn}>
                  {c.problem ? tReason(c.problem) : t('noAnswer')}
                </span>
              );
            },
          },
          {
            title: t('columns.difference'),
            key: 'difference',
            align: 'right',
            render: (_, r) => {
              const c = checkByDays.get(r.maxDays);
              if (!c?.difference) return <span className={styles.muted}>-</span>;
              if (c.difference === '0') return <span className={styles.ok}>{t('match')}</span>;
              return (
                <span className={styles.warn}>
                  {c.difference.startsWith('-')
                    ? t('partnerLower', { amount: fmt.money(c.difference.slice(1)) })
                    : t('partnerHigher', { amount: fmt.money(c.difference) })}
                </span>
              );
            },
          },
        ] satisfies DataTableColumn<PremiumPlanRow>[])
      : []),
  ];

  const columns = compact
    ? allColumns.filter((c) => COMPACT_COLUMNS.has(String(c.key)))
    : allColumns;

  return (
    <DataTable<PremiumPlanRow>
      label={label}
      columns={columns}
      items={[...rows]}
      rowKey={(row) => String(row.maxDays)}
      minWidth={compact ? 480 : check ? 1100 : 880}
      filtered={false}
      empty={{ title: t('empty') }}
    />
  );
}
