'use client';

import { Segmented, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { RECEIPTS_DEFAULT_LIMIT } from '@/features/finance/constants';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { DebtTable } from '@/features/finance/components/DebtTable';
import { useDebtFilters } from '@/features/finance/hooks/use-debt-filters';
import { useDebts } from '@/features/finance/hooks/use-debts';
import type { DebtItem } from '@/features/finance/types';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import styles from './debts-page.module.css';

export default function DebtsPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <DebtsView />
    </Suspense>
  );
}

function DebtsView() {
  const t = useTranslations('Finance.debts');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const { filters, setFilters } = useDebtFilters();
  const { data, isError, refetch, isFetching } = useDebts(filters);
  const [collect, setCollect] = useState<DebtItem | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const canRecord = has(PERMISSION.PAYMENT_RECORD);
  const canViewBooking = has(PERMISSION.BOOKING_VIEW);
  // "Tất cả" là từ vựng chung, ba nhãn còn lại thuộc về màn công nợ (skill i18n: không chép
  // chuỗi dùng chung vào bundle của tính năng).
  const filterOptions = [
    { value: 'all', label: tCommon('labels.all') },
    { value: 'overdue', label: t('filters.overdue') },
    { value: 'upcoming', label: t('filters.upcoming') },
    { value: 'unpaid', label: t('filters.unpaid') },
  ];

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      <div className={styles.filters}>
        <Segmented
          size="large"
          value={filters.filter ?? 'all'}
          options={filterOptions}
          onChange={(value) => setFilters({ filter: value === 'all' ? undefined : String(value) })}
        />
      </div>

      <DebtTable
        items={items}
        meta={meta}
        loading={isFetching}
        canRecord={canRecord}
        canView={canViewBooking}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        onView={(row) => setDetailBookingId(row.bookingId)}
        onCollect={setCollect}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      {/*
        Xem đơn mở CHÍNH modal chi tiết của feature bookings (cùng nội dung, cùng mutation,
        cùng quyền với trang `/manage/bookings/[id]`) — không dựng bản chi tiết thứ hai, và
        người thu nợ không rời danh sách đang lọc để rồi phải lọc lại.
      */}
      {detailBookingId ? (
        <BookingDetailDialog
          bookingId={detailBookingId}
          open
          onClose={() => setDetailBookingId(null)}
        />
      ) : null}

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
