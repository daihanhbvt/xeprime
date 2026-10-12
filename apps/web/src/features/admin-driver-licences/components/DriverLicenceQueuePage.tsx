'use client';

import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  DRIVER_LICENCE_KIND_VALUES,
  DRIVER_LICENCE_STATUS,
  DRIVER_LICENCE_STATUS_META,
  type DriverLicencePendingReason,
  type DriverLicenceStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { CountTabs } from '@/components/navigation/CountTabs';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { DRIVER_LICENCE_QUEUE_DEFAULT_STATUS, DRIVER_LICENCE_QUEUE_LIMIT } from '../api';
import {
  useDriverLicenceCounts,
  useDriverLicenceQueue,
  useDriverLicenceQueueFilters,
} from '../hooks/use-admin-driver-licences';
import type { PlatformDriverLicence } from '../types';
import { DriverLicenceReviewDrawer } from './DriverLicenceReviewDrawer';

const MIN_TABLE_WIDTH = 980;

/** Ba trạng thái người duyệt cần thấy — `superseded`/`cancelled` là lịch sử, không phải việc. */
const TAB_STATUSES = [
  DRIVER_LICENCE_STATUS.PENDING_REVIEW,
  DRIVER_LICENCE_STATUS.VERIFIED,
  DRIVER_LICENCE_STATUS.REJECTED,
] as const;

/**
 * Hàng đợi bằng lái của khách (ADR 0057).
 *
 * Mặc định là CHỜ DUYỆT, cũ nhất trước — người chờ lâu nhất được xem trước. Bộ lọc và lượt nộp
 * đang mở sống ở URL: F5 không đóng mất lượt đang đối chiếu, và gửi được đúng lượt đó cho người
 * khác bằng một đường link.
 */
export function DriverLicenceQueuePage() {
  const t = useTranslations('AdminDriverLicences');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const { filters, setFilters } = useDriverLicenceQueueFilters();
  const { data, isError, isFetching, refetch } = useDriverLicenceQueue(filters);
  const counts = useDriverLicenceCounts().data;
  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: DRIVER_LICENCE_QUEUE_LIMIT,
    total: 0,
    hasNext: false,
  };
  const pendingView =
    (filters.status ?? DRIVER_LICENCE_QUEUE_DEFAULT_STATUS) ===
    DRIVER_LICENCE_STATUS.PENDING_REVIEW;

  const pager = useOpenRecordPager(
    items.map((row) => row.id),
    filters.open,
  );
  const openRecord = (id: string | undefined) => {
    if (id) pager.remember();
    setFilters({ open: id }, { resetPage: false });
  };

  const countOf: Record<(typeof TAB_STATUSES)[number], number | undefined> = {
    [DRIVER_LICENCE_STATUS.PENDING_REVIEW]: counts?.pendingReview,
    [DRIVER_LICENCE_STATUS.VERIFIED]: counts?.verified,
    [DRIVER_LICENCE_STATUS.REJECTED]: counts?.rejected,
  };
  const tabLabel: Record<(typeof TAB_STATUSES)[number], string> = {
    [DRIVER_LICENCE_STATUS.PENDING_REVIEW]: t('tabs.pending'),
    [DRIVER_LICENCE_STATUS.VERIFIED]: t('tabs.verified'),
    [DRIVER_LICENCE_STATUS.REJECTED]: t('tabs.rejected'),
  };

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'kind',
      label: t('filters.kind'),
      allowClear: true,
      options: DRIVER_LICENCE_KIND_VALUES.map((kind) => ({
        value: kind,
        label: dl('driverLicenceKind', kind),
      })),
    },
  ];

  const empty = tCommon('labels.emptyValue');
  const columns: DataTableColumn<PlatformDriverLicence>[] = [
    {
      title: t('columns.account'),
      key: 'account',
      render: (_, row) => (
        <span>
          {row.owner.displayName}
          {row.owner.phone ? (
            <>
              {LIST_SEPARATOR}
              {row.owner.phone}
            </>
          ) : null}
        </span>
      ),
    },
    { title: t('columns.fullName'), key: 'fullName', render: (_, row) => row.fullName ?? empty },
    {
      title: t('columns.kind'),
      key: 'kind',
      width: 190,
      render: (_, row) => (row.kind ? dl('driverLicenceKind', row.kind) : empty),
    },
    {
      title: t('columns.classes'),
      key: 'classes',
      width: 110,
      render: (_, row) => row.classes.join(', ') || empty,
    },
    pendingView
      ? {
          title: t('columns.pendingReason'),
          key: 'pendingReason',
          width: 190,
          render: (_, row) =>
            row.reading.pendingReason
              ? t(`pendingReason.${row.reading.pendingReason as DriverLicencePendingReason}`)
              : empty,
        }
      : {
          title: t('columns.status'),
          key: 'status',
          width: 150,
          render: (_, row) => (
            <StatusTag
              value={row.status as DriverLicenceStatus}
              meta={DRIVER_LICENCE_STATUS_META}
              group="driverLicenceStatus"
            />
          ),
        },
    {
      title: t('columns.submittedAt'),
      key: 'submittedAt',
      width: 160,
      render: (_, row) => fmt.dateTime(row.submittedAt),
    },
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <CountTabs
        label={t('tabs.label')}
        value={(filters.status as (typeof TAB_STATUSES)[number] | undefined) ?? null}
        onChange={(status) => setFilters({ status, open: undefined })}
        items={TAB_STATUSES.map((status) => ({
          value: status,
          label: tabLabel[status],
          count: countOf[status],
        }))}
      />

      <FilterBar
        fields={fields}
        values={{ q: filters.q, kind: filters.kind }}
        onChange={(patch) => setFilters(patch)}
      />

      <DataTable<PlatformDriverLicence>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{
          title:
            pendingView && !filters.q && !filters.kind ? t('page.emptyPending') : t('page.empty'),
        }}
        onRowClick={(row) => openRecord(row.id)}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

      <DriverLicenceReviewDrawer
        id={filters.open ?? null}
        previousId={pager.previousId}
        nextId={pager.nextId}
        onNavigate={(id) => openRecord(id)}
        onClose={() => openRecord(undefined)}
      />
    </div>
  );
}
