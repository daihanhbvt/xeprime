'use client';

import { Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense, useMemo, useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { RECEIPTS_DEFAULT_LIMIT } from '@/features/finance/constants';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { DebtTable } from '@/features/finance/components/DebtTable';
import {
  clearedDebtFilters,
  hasDebtFilters,
  useDebtFilters,
} from '@/features/finance/hooks/use-debt-filters';
import { useDebts } from '@/features/finance/hooks/use-debts';
import type { DebtFilters, DebtItem } from '@/features/finance/types';
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

  /**
   * Ô tìm kiếm + nhóm hạn trên CÙNG một hàng, qua `FilterBar` dùng chung.
   *
   * Người thu nợ tới màn này với một cái tên, một số điện thoại hoặc một biển số trong đầu —
   * trước đây chỉ có bốn nút nhóm, nên tìm một đơn cụ thể là việc lật trang cho tới khi thấy.
   * Lọc chạy ở SERVER (cùng chỗ với phân trang), không phải cắt trên trang đang mở.
   *
   * "Tất cả" là từ vựng chung, ba nhãn còn lại thuộc về màn công nợ (skill i18n: không chép
   * chuỗi dùng chung vào bundle của tính năng).
   */
  const fields = useMemo<readonly FilterField[]>(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.searchLabel'),
        placeholder: t('filters.searchPlaceholder'),
      },
      {
        kind: 'segmented',
        key: 'filter',
        label: t('filters.groupLabel'),
        options: [
          { value: 'all', label: tCommon('labels.all') },
          { value: 'overdue', label: t('filters.overdue') },
          { value: 'upcoming', label: t('filters.upcoming') },
          { value: 'unpaid', label: t('filters.unpaid') },
        ],
      },
    ],
    [t, tCommon],
  );

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const filtered = hasDebtFilters(filters);

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      <FilterBar
        fields={fields}
        values={{ q: filters.q, filter: filters.filter ?? 'all' } satisfies FilterValues}
        onChange={(patch) => setFilters(patch as Partial<DebtFilters>)}
        onClear={filtered ? () => setFilters(clearedDebtFilters()) : undefined}
        // Hình thái gọn: ô tìm kiếm 240px đứng cạnh nhóm hạn thay vì đẩy nhóm sang mép phải.
        compactFields
      />

      <DebtTable
        items={items}
        meta={meta}
        loading={isFetching}
        canRecord={canRecord}
        canView={canViewBooking}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        // Rỗng vì CHƯA CÓ NỢ là tin vui; rỗng vì lọc quá tay là chuyện khác hẳn — bảng đã tách
        // hai câu chữ đó sẵn, trước đây trang không nói cho nó biết mình đang lọc.
        filtered={filtered}
        onClearFilters={() => setFilters(clearedDebtFilters())}
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
