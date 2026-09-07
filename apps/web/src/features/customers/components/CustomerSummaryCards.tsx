'use client';

import { AlertOutlined, StopOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { TENANT_CUSTOMER_RETURNING_MIN_RENTALS } from '@xeprime/types';
import { StatCard } from '@/features/dashboard/components/StatCard';
import type { TenantCustomerSummary } from '../types';
import styles from './CustomerSummaryCards.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Dải chỉ số đầu trang sổ khách.
 *
 * Ô công nợ **biến mất hoàn toàn** khi thiếu `finance.view` — không render "0 ₫" hay một ô mờ,
 * vì "không được xem" và "không có nợ" là hai chuyện khác nhau và một số 0 giả sẽ được đọc như
 * sự thật. Backend cũng trả `null`/`-1` cho đúng lý do đó.
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

  return (
    <div className={styles.grid}>
      <StatCard
        label={t('active')}
        value={summary?.activeCustomers ?? 0}
        icon={TeamOutlined}
        tone="blue"
        loading={loading}
      />
      <StatCard
        label={t('returning', { count: TENANT_CUSTOMER_RETURNING_MIN_RENTALS })}
        value={summary?.returningCustomers ?? 0}
        icon={TeamOutlined}
        tone="green"
        loading={loading}
      />
      {canViewFinance ? (
        <StatCard
          label={t('debt', { count: summary?.debtCustomers ?? 0 })}
          value={fmt.money(summary?.totalDebt)}
          icon={WalletOutlined}
          tone="gold"
          danger={(summary?.debtCustomers ?? 0) > 0}
          loading={loading}
        />
      ) : null}
      <StatCard
        label={t('risk')}
        value={riskCount}
        icon={riskCount > 0 ? AlertOutlined : StopOutlined}
        tone="red"
        danger={riskCount > 0}
        loading={loading}
      />
    </div>
  );
}
