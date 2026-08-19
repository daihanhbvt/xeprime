'use client';

import { AlertOutlined, StopOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
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
  const fmt = useAppFormat();

  const riskCount = (summary?.watchlistCustomers ?? 0) + (summary?.blockedCustomers ?? 0);

  return (
    <div className={styles.grid}>
      <StatCard
        label="Khách đang hoạt động"
        value={summary?.activeCustomers ?? 0}
        icon={TeamOutlined}
        tone="blue"
        loading={loading}
      />
      <StatCard
        label="Khách quen (≥ 2 chuyến)"
        value={summary?.returningCustomers ?? 0}
        icon={TeamOutlined}
        tone="green"
        loading={loading}
      />
      {canViewFinance ? (
        <StatCard
          label={`Còn nợ · ${summary?.debtCustomers ?? 0} khách`}
          value={fmt.money(summary?.totalDebt)}
          icon={WalletOutlined}
          tone="gold"
          danger={(summary?.debtCustomers ?? 0) > 0}
          loading={loading}
        />
      ) : null}
      <StatCard
        label="Cần lưu ý / từ chối phục vụ"
        value={riskCount}
        icon={riskCount > 0 ? AlertOutlined : StopOutlined}
        tone="red"
        danger={riskCount > 0}
        loading={loading}
      />
    </div>
  );
}
