'use client';

import { CarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BOOKING_HISTORY_KIND,
  BOOKING_HISTORY_OUTCOME,
  BOOKING_HISTORY_OUTCOME_VALUES,
  BOOKING_HISTORY_TAB,
  BOOKING_HISTORY_TAB_OUTCOMES,
  BOOKING_HISTORY_TAB_VALUES,
  PERMISSION,
  SERVICE_TYPE_VALUES,
  type BookingHistoryOutcome,
  type BookingHistoryTab,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { ServiceTypeChip } from '@/components/data-display/ServiceTypeChip';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { SegmentedTabs } from '@/components/navigation/SegmentedTabs';
import { ALL_FILTER } from '@/constants/filters';
import { bookingPath, ROUTES } from '@/constants/routes';
import { fetchBookingRequest } from '@/features/booking-requests/api';
import { BookingRequestDetailDialog } from '@/features/booking-requests/components/BookingRequestDetailDialog';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { VehicleDetailDialog } from '@/features/vehicles/components/VehicleDetailDialog';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { toAppTz } from '@/lib/datetime';
import { queryKeys } from '@/services/query-keys';
import { useBookingHistory } from '../hooks/use-booking-history';
import type { BookingHistoryFilters, BookingHistoryItem } from '../types';
import styles from './BookingHistoryView.module.css';

/** Bảng 8 cột — dưới bề rộng này `DataTable` chuyển sang thẻ. */
const MIN_TABLE_WIDTH = 1180;

function useHistoryFilters() {
  return useUrlFilters<BookingHistoryFilters>((sp) => ({
    tab: enumParam(sp, 'tab', BOOKING_HISTORY_TAB_VALUES) as BookingHistoryTab | undefined,
    outcome: enumParam(sp, 'outcome', BOOKING_HISTORY_OUTCOME_VALUES) as
      | BookingHistoryOutcome
      | undefined,
    q: sp.get('q') ?? undefined,
    serviceType: sp.get('serviceType') ?? undefined,
    branchId: sp.get('branchId') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}

/**
 * "Đơn đã kết thúc" — Figma Partner-XePrime "Rental Request - Order Done" (`23948:87473`,
 * 05/11/2026): mọi chuyến đã xong việc của gian hàng, MỘT bảng xếp theo lúc kết thúc. Bốn ngăn: Tất
 * cả · Hoàn thành · Đã huỷ (đơn huỷ + khách không đến) · Không thành đơn (yêu cầu bị từ chối, quá hạn,
 * khách rút, hết hạn thanh toán, xe đã có người nhận, gian hàng huỷ khi chờ khách trả — chốt với
 * người dùng 05/11, sổ cái §3.2). Kết cục do SERVER suy; lọc/phân trang ở server (`GET /booking-history`).
 *
 * "Xuất Excel" của design CHƯA làm — ẩn hẳn (chốt 05/11). Dòng đơn mở trang chi tiết đơn; dòng
 * yêu cầu mở popup chi tiết yêu cầu (chỉ đọc — yêu cầu đã đóng không còn quyết định nào).
 */
export function BookingHistoryView() {
  const t = useTranslations('Bookings.history');
  const tCommon = useTranslations('Common');
  const tRequests = useTranslations('BookingRequests');
  const label = useDomainLabel();
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  const { filters, setFilters } = useHistoryFilters();
  const branch = useBranchFilter({
    value: filters.branchId,
    onChange: (branchId) => setFilters({ branchId }),
  });
  const { data, isFetching, isError, isPlaceholderData, refetch } = useBookingHistory(filters);

  const tab = filters.tab ?? BOOKING_HISTORY_TAB.ALL;
  const meta = data?.meta;
  const includesRequests = meta?.includesRequests ?? has(PERMISSION.BOOKING_REQUEST_VIEW);
  const counts = meta?.tabCounts;

  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [vehicleDetailId, setVehicleDetailId] = useState<string | null>(null);
  const openRequest = useQuery({
    queryKey: queryKeys.bookingRequests.detail(openRequestId ?? ''),
    queryFn: () => fetchBookingRequest(openRequestId as string),
    enabled: openRequestId !== null,
  });

  const tabs = BOOKING_HISTORY_TAB_VALUES.filter(
    (value) => value !== BOOKING_HISTORY_TAB.NOT_CONVERTED || includesRequests,
  ).map((value) => ({
    value,
    label: t(`tabs.${value}`),
    count: counts ? counts[tabCountKey(value)] : undefined,
  }));

  // Ô "Trạng thái" mời đúng kết cục của ngăn đang mở; một kết cục duy nhất (Hoàn thành) thì bỏ ô.
  const outcomeOptions = BOOKING_HISTORY_TAB_OUTCOMES[tab].filter(
    (outcome) => includesRequests || !outcome.startsWith('request_'),
  );
  const fields: readonly FilterField[] = [
    { kind: 'search', key: 'q', label: t('searchLabel'), placeholder: t('searchPlaceholder') },
    ...(branch.field ? [branch.field] : []),
    {
      kind: 'select',
      key: 'serviceType',
      label: t('serviceLabel'),
      allowClear: false,
      options: [
        { value: ALL_FILTER, label: t('serviceAll') },
        ...SERVICE_TYPE_VALUES.map((value) => ({ value, label: label('serviceType', value) })),
      ],
    },
    ...(outcomeOptions.length > 1
      ? [
          {
            kind: 'select' as const,
            key: 'outcome',
            label: t('outcomeLabel'),
            allowClear: false,
            options: [
              { value: ALL_FILTER, label: t('outcomeAll') },
              ...outcomeOptions.map((value) => ({
                value,
                label: label('bookingHistoryOutcome', value),
              })),
            ],
          },
        ]
      : []),
  ];

  function changeFilters(patch: FilterValues) {
    const next: Partial<BookingHistoryFilters> = {};
    if ('q' in patch) next.q = patch.q;
    if ('branchId' in patch) next.branchId = patch.branchId === ALL_FILTER ? undefined : patch.branchId;
    if ('serviceType' in patch) {
      next.serviceType = patch.serviceType === ALL_FILTER ? undefined : patch.serviceType;
    }
    if ('outcome' in patch) {
      next.outcome =
        patch.outcome === ALL_FILTER ? undefined : (patch.outcome as BookingHistoryOutcome);
    }
    setFilters(next);
  }

  function selectTab(value: string) {
    // Kết cục của ngăn cũ không nhất thiết thuộc ngăn mới — gỡ luôn.
    setFilters({ tab: value as BookingHistoryTab, outcome: undefined });
  }

  const filtered = Boolean(filters.q || filters.branchId || filters.serviceType || filters.outcome);
  function clearFilters() {
    setFilters({ q: undefined, branchId: undefined, serviceType: undefined, outcome: undefined });
  }

  function openRow(row: BookingHistoryItem) {
    if (row.kind === BOOKING_HISTORY_KIND.BOOKING) router.push(bookingPath.detail(row.id));
    else setOpenRequestId(row.id);
  }

  const columns: DataTableColumn<BookingHistoryItem>[] = [
    {
      title: t('columns.code'),
      key: 'code',
      width: 150,
      render: (_, row) =>
        row.code ? (
          <span className={styles.code}>#{row.code}</span>
        ) : (
          <span className={styles.muted}>{t('noCode')}</span>
        ),
    },
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      width: 300,
      render: (_, row) => <VehicleCell row={row} noImageLabel={tRequests('vehicle.noImage')} />,
    },
    {
      title: t('columns.service'),
      key: 'service',
      width: 150,
      render: (_, row) => <ServiceTypeChip value={row.serviceType} />,
    },
    {
      title: t('columns.customer'),
      key: 'customer',
      width: 190,
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.strong}>{row.customerName}</span>
          {row.customerPhone ? <span className={styles.sub}>{row.customerPhone}</span> : null}
        </div>
      ),
    },
    {
      title: t('columns.period'),
      key: 'period',
      width: 220,
      render: (_, row) => <PeriodCell row={row} />,
    },
    {
      title: t('columns.outcome'),
      key: 'outcome',
      width: 190,
      render: (_, row) => <OutcomeBadge outcome={row.outcome as BookingHistoryOutcome} />,
    },
    {
      title: t('columns.endedAt'),
      key: 'endedAt',
      width: 160,
      render: (_, row) => <span className={styles.endedAt}>{fmt.dateTime(row.endedAt)}</span>,
    },
    {
      title: t('columns.actions'),
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 148,
      render: (_, row) => (
        <Button className={styles.openButton} onClick={() => openRow(row)}>
          {t('open')}
        </Button>
      ),
    },
  ];

  const renderCard = (row: BookingHistoryItem) => (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={row.code ? styles.code : styles.muted}>
          {row.code ? `#${row.code}` : t('noCode')}
        </span>
        <OutcomeBadge outcome={row.outcome as BookingHistoryOutcome} />
      </header>
      <VehicleCell row={row} noImageLabel={tRequests('vehicle.noImage')} />
      <dl className={styles.cardFacts}>
        <div>
          <dt>{t('columns.customer')}</dt>
          <dd>
            {row.customerName}
            {row.customerPhone ? ` · ${row.customerPhone}` : ''}
          </dd>
        </div>
        <div>
          <dt>{t('columns.period')}</dt>
          <dd>
            <PeriodCell row={row} />
          </dd>
        </div>
        <div>
          <dt>{t('columns.endedAt')}</dt>
          <dd>{fmt.dateTime(row.endedAt)}</dd>
        </div>
      </dl>
      <Button block className={styles.openButton} onClick={() => openRow(row)}>
        {t('open')}
      </Button>
    </article>
  );

  return (
    <div className={styles.page}>
      {/* Mắt xích "Đơn thuê xe" của breadcrumb do vỏ trang tự thêm (route con của mục menu đó). */}
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className={styles.toolbar}>
        <SegmentedTabs label={t('tabsLabel')} value={tab} items={tabs} onChange={selectTab} />
        <FilterBar
          fields={fields}
          values={{
            q: filters.q,
            branchId: filters.branchId ?? ALL_FILTER,
            serviceType: filters.serviceType ?? ALL_FILTER,
            outcome: filters.outcome ?? ALL_FILTER,
          }}
          onChange={changeFilters}
          searchDebounceMs={300}
          compactFields
          className={styles.filters}
        />
      </div>

      <DataTable<BookingHistoryItem>
        label={t('tableLabel')}
        columns={columns}
        items={data?.items ?? []}
        rowKey={(row) => `${row.kind}-${row.id}`}
        minWidth={MIN_TABLE_WIDTH}
        framed
        striped={false}
        loading={isFetching && (!data || isPlaceholderData)}
        error={isError && !data ? { title: t('errorTitle'), onRetry: () => void refetch() } : null}
        filtered={filtered}
        empty={{ title: t(`empty.${tab}.title`), description: t(`empty.${tab}.body`) }}
        noResults={{
          title: t('noResultsTitle'),
          description: t('noResultsBody'),
          action: <Button onClick={clearFilters}>{tCommon('actions.clear')}</Button>,
        }}
        onRowClick={openRow}
        renderCard={renderCard}
        pagination={
          meta
            ? {
                meta,
                onChange: (page, pageSize) => setFilters({ page, limit: pageSize }),
                totalLabel: (total) => t('totalLabel', { count: total }),
              }
            : undefined
        }
      />

      {/*
        Yêu cầu đã đóng: popup chi tiết YÊU CẦU (cùng màn đã có), chỉ đọc — không còn quyết định
        nào cho một yêu cầu đã chết, nên `canApprove` tắt.
      */}
      <BookingRequestDetailDialog
        request={openRequestId && openRequest.data?.id === openRequestId ? openRequest.data : null}
        canApprove={false}
        pendingAction={null}
        onClose={() => setOpenRequestId(null)}
        onApprove={() => undefined}
        onReject={() => undefined}
        onCancel={() => undefined}
        onOpenVehicle={(row) => setVehicleDetailId(row.vehicleId)}
        backHref={ROUTES.MANAGE.BOOKINGS_ENDED}
      />

      {vehicleDetailId ? (
        <VehicleDetailDialog vehicleId={vehicleDetailId} open onClose={() => setVehicleDetailId(null)} />
      ) : null}
    </div>
  );
}

function tabCountKey(tab: BookingHistoryTab): 'all' | 'completed' | 'cancelled' | 'notConverted' {
  switch (tab) {
    case BOOKING_HISTORY_TAB.COMPLETED:
      return 'completed';
    case BOOKING_HISTORY_TAB.CANCELLED:
      return 'cancelled';
    case BOOKING_HISTORY_TAB.NOT_CONVERTED:
      return 'notConverted';
    default:
      return 'all';
  }
}

function VehicleCell({ row, noImageLabel }: { row: BookingHistoryItem; noImageLabel: string }) {
  return (
    <div className={styles.vehicle}>
      <span className={styles.thumb}>
        {row.vehicleImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.vehicleImageUrl} alt="" loading="lazy" className={styles.thumbImage} />
        ) : (
          <CarOutlined aria-hidden="true" title={noImageLabel} />
        )}
      </span>
      <div className={styles.stack}>
        <span className={styles.strong} title={row.vehicleName}>
          {row.vehicleName}
        </span>
        {row.vehiclePlate ? <span className={styles.sub}>{row.vehiclePlate}</span> : null}
      </div>
    </div>
  );
}

/** "09/11 22:00 → 10/11 22:00" + thời lượng; dài hạn chưa từng chốt lịch thì nói gói. */
function PeriodCell({ row }: { row: BookingHistoryItem }) {
  const t = useTranslations('Bookings.history');
  const fmt = useAppFormat();
  if (!row.pickupAt || !row.returnAt) {
    return (
      <span className={styles.sub}>
        {row.longTermPackageMonths ? fmt.packageLabel(row.longTermPackageMonths) : t('noSchedule')}
      </span>
    );
  }
  const pickup = toAppTz(row.pickupAt);
  const dropoff = toAppTz(row.returnAt);
  return (
    <div className={styles.stack}>
      <span className={styles.strong}>
        {fmt.rentalPointCompact(pickup)} → {fmt.rentalPointCompact(dropoff)}
      </span>
      <span className={styles.sub}>{fmt.rentalDuration(pickup, dropoff)}</span>
    </div>
  );
}

/** Viên kết cục có chấm — xanh "Hoàn thành", đỏ mọi kết cục không trọn (design). */
function OutcomeBadge({ outcome }: { outcome: BookingHistoryOutcome }) {
  const label = useDomainLabel();
  return (
    <span
      className={cx(
        styles.outcome,
        outcome === BOOKING_HISTORY_OUTCOME.COMPLETED ? styles.outcomeSuccess : styles.outcomeDanger,
      )}
    >
      {label('bookingHistoryOutcome', outcome)}
    </span>
  );
}
