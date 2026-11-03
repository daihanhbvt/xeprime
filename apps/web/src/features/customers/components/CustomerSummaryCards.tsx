'use client';

import {
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  StarOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { TENANT_CUSTOMER_RETURNING_MIN_RENTALS } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import type { TenantCustomerSummary } from '../types';
import styles from './CustomerSummaryCards.module.css';

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';

interface Item {
  key: string;
  icon: ComponentType;
  tone: Tone;
  value: string | number;
  label: string;
  danger?: boolean;
}

/**
 * Dải số liệu đầu "Danh sách khách hàng" — Figma Partner-XePrime `23777:53832` (02/11/2026): sáu
 * ô trong MỘT thẻ, biểu tượng tròn + số + nhãn.
 *
 * Hai ô tiền **biến mất hoàn toàn** khi thiếu `finance.view` — "không được xem" khác hẳn "không có"
 * và một số 0 giả sẽ được đọc như sự thật. Server cũng trả `null` cho đúng lý do đó.
 */
export function CustomerSummaryCards({
  summary,
  loading,
  canViewFinance,
}: {
  summary: TenantCustomerSummary | undefined;
  loading: boolean;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.summary');
  const fmt = useAppFormat();
  const riskCount = (summary?.watchlistCustomers ?? 0) + (summary?.blockedCustomers ?? 0);
  const debt = summary?.totalDebt ?? null;

  const items: Item[] = [
    {
      key: 'customers',
      icon: TeamOutlined,
      tone: 'neutral',
      value: summary?.activeCustomers ?? 0,
      label: t('totalCustomers'),
    },
    {
      key: 'rentals',
      icon: CheckCircleOutlined,
      tone: 'info',
      value: summary?.totalRentals ?? 0,
      label: t('totalRentals'),
    },
    ...(canViewFinance
      ? [
          {
            key: 'revenue',
            icon: WalletOutlined,
            tone: 'success' as const,
            value: fmt.money(summary?.totalRevenue),
            label: t('totalRevenue'),
          },
          {
            key: 'debt',
            icon: DollarOutlined,
            tone: 'danger' as const,
            value: fmt.money(debt),
            label: t('debt', { count: summary?.debtCustomers ?? 0 }),
            danger: debt !== null && !isZeroMoney(debt),
          },
        ]
      : []),
    {
      key: 'returning',
      icon: StarOutlined,
      tone: 'warning',
      value: summary?.returningCustomers ?? 0,
      label: t('returning', { count: TENANT_CUSTOMER_RETURNING_MIN_RENTALS }),
    },
    {
      key: 'risk',
      icon: ExclamationCircleOutlined,
      tone: 'danger',
      value: riskCount,
      label: t('risk'),
    },
  ];

  return (
    <section className={styles.strip} aria-label={t('ariaLabel')}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className={styles.item}>
            <span className={cx(styles.icon, styles[item.tone])} aria-hidden="true">
              <Icon />
            </span>
            <span className={styles.text}>
              {loading ? (
                <Skeleton.Input active size="small" className={styles.skeleton} />
              ) : (
                <b className={cx(styles.value, item.danger && styles.valueDanger)}>{item.value}</b>
              )}
              <span className={styles.label}>{item.label}</span>
            </span>
          </div>
        );
      })}
    </section>
  );
}
