'use client';

import { Segmented, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { RECEIPTS_DEFAULT_LIMIT } from '@/features/finance/constants';
import { DebtTable } from '@/features/finance/components/DebtTable';
import { useDebtFilters } from '@/features/finance/hooks/use-debt-filters';
import { useDebts } from '@/features/finance/hooks/use-debts';
import type { DebtItem } from '@/features/finance/types';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import styles from './debts-page.module.css';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'upcoming', label: 'Sắp đến hạn' },
  { value: 'unpaid', label: 'Chưa thu' },
];

export default function DebtsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <DebtsView />
    </Suspense>
  );
}

function DebtsView() {
  const { has } = usePermissions();
  const { filters, setFilters } = useDebtFilters();
  const { data, isError, refetch, isFetching } = useDebts(filters);
  const [collect, setCollect] = useState<DebtItem | null>(null);

  const canRecord = has(PERMISSION.PAYMENT_RECORD);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };

  return (
    <div>
      <ManagePageHeader title="Công nợ" />

      <div className={styles.filters}>
        <Segmented
          size="large"
          value={filters.filter ?? 'all'}
          options={FILTER_OPTIONS}
          onChange={(value) => setFilters({ filter: value === 'all' ? undefined : String(value) })}
        />
      </div>

      <DebtTable
        items={items}
        meta={meta}
        loading={isFetching}
        canRecord={canRecord}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        onCollect={setCollect}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      {collect ? (
        <RecordPaymentModal
          bookingId={collect.bookingId}
          debtAmount={collect.debtAmount}
          open={Boolean(collect)}
          onClose={() => setCollect(null)}
        />
      ) : null}
    </div>
  );
}
