'use client';

import { Segmented, Select } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_SELECTABLE_VALUES,
  DEBT_FILTER,
  DEBT_FILTER_VALUES,
  DEBT_SORT_VALUES,
  DEFAULT_DEBT_SORT,
  PERMISSION,
  type DebtFilter,
} from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import segmentedStyles from '@/components/filter/segmented.module.css';
import { ALL_FILTER } from '@/constants/filters';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { RECEIPTS_DEFAULT_LIMIT } from '../constants';
import { clearedDebtFilters, hasDebtFilters, useDebtFilters } from '../hooks/use-debt-filters';
import { useDebtSummary, useDebts } from '../hooks/use-debts';
import type { DebtFilters, DebtItem, DebtSummary } from '../types';
import { DebtDetailDialog } from './DebtDetailDialog';
import { DebtSummaryCards } from './DebtSummaryCards';
import { DebtTable } from './DebtTable';
import { FinanceBoard } from './FinanceBoard';
import styles from './DebtsView.module.css';

/** Số đếm của từng chip — đọc từ dải thẻ, không đếm trên trang đang mở. */
function groupCount(summary: DebtSummary | undefined, group: DebtFilter): number | null {
  if (!summary) return null;
  switch (group) {
    case DEBT_FILTER.OVERDUE:
      return summary.overdueCount;
    case DEBT_FILTER.UPCOMING:
      return summary.upcomingCount;
    case DEBT_FILTER.UNPAID:
      return summary.unpaidCount;
    default:
      return summary.totalCount;
  }
}

/** Trạng thái đơn chọn được: đơn huỷ không bao giờ nằm trong công nợ, nên không có trong ô. */
const DEBT_STATUS_OPTIONS = BOOKING_STATUS_SELECTABLE_VALUES.filter(
  (status) => status !== BOOKING_STATUS.CANCELLED,
);

/**
 * Tab "Công nợ" của Lịch sử giao dịch — design Partner-XePrime `23857:58932` (chốt 04/11/2026:
 * một URL `/receipts?view=debts`, `/debts` cũ chuyển tiếp về đây).
 *
 * Bốn thẻ · chip nhóm hạn có số đếm · tìm kiếm + chi nhánh + trạng thái đơn · "Sắp xếp: …" · bảng.
 * Lọc, sắp xếp, phân trang đều chạy ở SERVER và sống trên URL (ADR 0004). "Xem đơn" mở hộp công
 * nợ gọn, "Thu tiền" mở chính hộp thu tiền đơn của chi tiết đơn.
 */
export function DebtsView() {
  const t = useTranslations('Finance.debts');
  const dl = useDomainLabel();
  const { has } = usePermissions();
  const { filters, setFilters } = useDebtFilters();
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });
  const { data, isError, refetch, isFetching } = useDebts(filters);
  const summary = useDebtSummary(filters);
  const [collect, setCollect] = useState<DebtItem | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const canRecord = has(PERMISSION.PAYMENT_RECORD);
  const canViewBooking = has(PERMISSION.BOOKING_VIEW);

  /*
   * Tìm kiếm + chi nhánh + trạng thái đơn qua `FilterBar` dùng chung. Người thu nợ tới màn này với
   * một cái tên, một số điện thoại hoặc một biển số trong đầu — lọc chạy ở SERVER, cùng chỗ với
   * phân trang, không phải cắt trên trang đang mở.
   */
  const fields = useMemo<readonly FilterField[]>(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.searchLabel'),
        placeholder: t('filters.searchPlaceholder'),
      },
      ...(branch.field ? [branch.field] : []),
      {
        kind: 'select',
        key: 'status',
        label: t('filters.status'),
        options: DEBT_STATUS_OPTIONS.map((value) => ({
          value,
          label: dl('bookingStatus', value),
        })),
      },
    ],
    [t, dl, branch.field],
  );

  const sortOptions = useMemo(
    () => DEBT_SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) })),
    [t],
  );

  const groupOptions = DEBT_FILTER_VALUES.map((value) => {
    const count = groupCount(summary.data, value);
    const label = value === DEBT_FILTER.ALL ? t('filters.all') : t(`filters.${value}`);
    return {
      value,
      label: (
        <span className={styles.group}>
          {label}
          {count !== null ? <span className={styles.count}>{count}</span> : null}
        </span>
      ),
    };
  });

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: RECEIPTS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const filtered = hasDebtFilters(filters);

  return (
    <>
      <DebtSummaryCards data={summary.data} loading={summary.isFetching} error={summary.isError} />

      <FinanceBoard
        title={t('board.title')}
        toolbar={
          <>
            {/* Nhóm hạn là một BỘ LỌC dạng chip có số đếm (design) — đứng ngoài FilterBar để số
                đếm luôn nhìn thấy, không chui vào popover "Bộ lọc" trên màn hẹp. */}
            <div className={styles.groups}>
              <Segmented
                className={segmentedStyles.outlined}
                size="large"
                options={groupOptions}
                value={filters.filter ?? DEBT_FILTER.ALL}
                onChange={(value) => setFilters({ filter: String(value) })}
                aria-label={t('filters.groupLabel')}
              />
            </div>
            <FilterBar
              className={styles.filters}
              fields={fields}
              values={
                {
                  q: filters.q,
                  status: filters.status,
                  branchId: filters.branchId ?? ALL_FILTER,
                } satisfies FilterValues
              }
              onChange={(patch) =>
                setFilters(
                  ('branchId' in patch
                    ? {
                        ...patch,
                        branchId: patch.branchId === ALL_FILTER ? undefined : patch.branchId,
                      }
                    : patch) as Partial<DebtFilters>,
                )
              }
              onClear={filtered ? () => setFilters(clearedDebtFilters()) : undefined}
              actions={
                // Sắp xếp không phải bộ lọc: không vào huy hiệu đếm, "Xoá bộ lọc" giữ nguyên nó.
                <Select
                  className={styles.sort}
                  size="large"
                  aria-label={t('sort.label')}
                  labelRender={(item) => t('sort.value', { label: String(item.label) })}
                  options={sortOptions}
                  value={filters.sort ?? DEFAULT_DEBT_SORT}
                  onChange={(value) => setFilters({ sort: value })}
                  popupMatchSelectWidth={false}
                />
              }
            />
          </>
        }
      >
        <DebtTable
          items={items}
          meta={meta}
          loading={isFetching}
          canRecord={canRecord}
          canView={canViewBooking}
          error={isError && !data ? { onRetry: () => void refetch() } : null}
          // Rỗng vì CHƯA CÓ NỢ là tin vui; rỗng vì lọc quá tay là chuyện khác hẳn.
          filtered={filtered}
          onClearFilters={() => setFilters(clearedDebtFilters())}
          onView={(row) => setDetailBookingId(row.bookingId)}
          onCollect={setCollect}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      </FinanceBoard>

      {detailBookingId ? (
        <DebtDetailDialog bookingId={detailBookingId} onClose={() => setDetailBookingId(null)} />
      ) : null}

      {collect ? (
        <RecordPaymentModal
          bookingId={collect.bookingId}
          debtAmount={collect.debtAmount}
          open={Boolean(collect)}
          onClose={() => setCollect(null)}
        />
      ) : null}
    </>
  );
}
