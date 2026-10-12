'use client';

import { EyeOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS_META,
  PLATFORM_TRIP_QUEUE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type BookingStatus,
  type PlatformTripBookingQueue,
  type TenantStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { AdminBookingDetailDrawer } from '@/features/admin-bookings/components/AdminBookingDetailDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { TRIPS_DEFAULT_LIMIT } from '../api';
import { useTripBookings } from '../hooks/use-admin-trips';
import { useTripQueueFilters } from '../hooks/use-trip-queue-filters';
import type { TripBooking } from '../types';
import { useNow } from '@/hooks/use-now';
import { HandoverDistance } from './TripDeadline';
import styles from './TripQueuePanels.module.css';

/** Sáu cột, hai cột mốc giờ có chip — dưới ngưỡng này bảng cuộn ngang. */
const MIN_TABLE_WIDTH = 1040;

/**
 * Hàng đợi ĐƠN THUÊ — hai chặng sau khi đã giữ chỗ:
 *  - `pickup_soon`: giao xe trong 24 giờ tới, quá giờ lên đầu — chip cột GIAO XE.
 *  - `active`: xe đang ở với khách, quá giờ trả lên đầu — chip cột TRẢ XE.
 *
 * Chi tiết đơn mở ở drawer chuẩn (có mask, bấm ra ngoài là đóng — cùng panel của màn Đơn thuê
 * toàn hệ thống). Đơn đang mở sống ở URL (`?open=`): F5 và gửi link đều mở lại đúng đơn.
 */
export function BookingQueuePanel({ queue }: { queue: PlatformTripBookingQueue }) {
  const t = useTranslations('AdminTrips');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const now = useNow();
  const { filters, setFilters } = useTripQueueFilters();
  const { open, ...listFilters } = filters;
  const { data, isError, isFetching, refetch } = useTripBookings({ queue, ...listFilters });

  const pickupQueue = queue === PLATFORM_TRIP_QUEUE.PICKUP_SOON;
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: TRIPS_DEFAULT_LIMIT, total: 0, hasNext: false };

  // Mở/đóng panel chỉ đổi giao diện — không được đưa người dùng về trang 1.
  const openBooking = (id: string | undefined) => setFilters({ open: id }, { resetPage: false });

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
  ];

  const handover = (at: string, withChip: boolean) => (
    <div className={styles.stack}>
      <span className={styles.period}>{fmt.shortDateTime(at)}</span>
      {withChip ? <HandoverDistance at={at} now={now} /> : null}
    </div>
  );

  const columns: DataTableColumn<TripBooking>[] = [
    {
      title: t('booking.code'),
      key: 'code',
      width: 160,
      render: (_, r) => (
        <div className={styles.stack}>
          {/* Mã đơn là NÚT mở panel: người dùng bàn phím cũng mở được dù cả hàng bấm được bằng chuột. */}
          <button
            type="button"
            className={styles.codeButton}
            aria-label={t('booking.openDetail', { code: r.code })}
            onClick={() => openBooking(r.id)}
          >
            {r.code}
          </button>
          <span className={styles.meta}>{r.customerName}</span>
        </div>
      ),
    },
    {
      title: t('booking.vehicle'),
      key: 'vehicle',
      width: 230,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.primary}>
            {r.vehicleName}
            {r.vehiclePlateNumber ? ` · ${r.vehiclePlateNumber}` : ''}
          </span>
          <span className={styles.tenantName}>
            <span className={styles.meta}>{r.tenantName}</span>
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag
                value={r.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
            ) : null}
          </span>
        </div>
      ),
    },
    {
      title: t('booking.pickup'),
      key: 'pickup',
      width: 170,
      render: (_, r) => handover(r.pickupAt, pickupQueue),
    },
    {
      title: t('booking.return'),
      key: 'return',
      width: 170,
      render: (_, r) => handover(r.returnAt, !pickupQueue),
    },
    {
      title: tCommon('labels.status'),
      key: 'status',
      width: 130,
      render: (_, r) => (
        <StatusTag
          value={r.status as BookingStatus}
          meta={BOOKING_STATUS_META}
          group="bookingStatus"
        />
      ),
    },
    actionColumn<TripBooking>(
      (row) => [
        {
          key: 'detail',
          label: t('booking.detail'),
          icon: <EyeOutlined />,
          onClick: () => openBooking(row.id),
        },
      ],
      { width: 130 },
    ),
  ];

  return (
    <div className={styles.panel}>
      <FilterBar
        compactFields
        fields={fields}
        values={{ q: filters.q }}
        onChange={(patch) => setFilters({ q: patch.q })}
      />
      <DataTable<TripBooking>
        label={t('booking.label')}
        columns={columns}
        items={items}
        onRowClick={(row) => openBooking(row.id)}
        selectedRowKey={open ?? null}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('booking.loadError'), onRetry: () => void refetch() } : null
        }
        filtered={Boolean(filters.q)}
        empty={{ title: t(`empty.${queue}`) }}
        noResults={{ title: t('booking.noResults') }}
        pagination={{
          meta,
          onChange: (page, pageSize) => setFilters({ page, limit: pageSize }),
          totalLabel: (total) => t('booking.total', { count: total }),
        }}
        renderCard={(row) => (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.stack}>
                <span className={styles.primary}>{row.code}</span>
                <span className={styles.meta}>{row.customerName}</span>
              </div>
              <HandoverDistance at={pickupQueue ? row.pickupAt : row.returnAt} now={now} />
            </div>
            <div className={styles.cardLine}>
              {row.vehicleName}
              {row.vehiclePlateNumber ? ` · ${row.vehiclePlateNumber}` : ''}
            </div>
            <div className={styles.meta}>{row.tenantName}</div>
            <span className={styles.period}>
              {fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}
            </span>
          </article>
        )}
      />

      <AdminBookingDetailDrawer bookingId={open ?? null} onClose={() => openBooking(undefined)} />
    </div>
  );
}
