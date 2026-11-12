'use client';

import {
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  StarOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { TENANT_CUSTOMER_RETURNING_MIN_RENTALS } from '@xeprime/types';
import { SummaryStrip, type SummaryStripItem } from '@/components/data-display/SummaryStrip';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import type { TenantCustomerSummary } from '../types';

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

  const items: SummaryStripItem[] = [
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

  return <SummaryStrip items={items} loading={loading} ariaLabel={t('ariaLabel')} />;
}
