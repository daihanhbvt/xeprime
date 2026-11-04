'use client';

import { ArrowRightOutlined, CarOutlined, EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  BOOKING_STATUS_VALUES,
  SERVICE_TYPE,
  type BookingStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { SectionCard } from '@/components/layout/SectionCard';
import { bookingPath } from '@/constants/routes';
import { BookingDriverCell } from '@/features/bookings/components/BookingDriverCell';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { dayjs } from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import { CUSTOMER_HISTORY_DEFAULT_LIMIT } from '../api';
import { useCustomerBookingHistory } from '../hooks/use-customers';
import type { CustomerBooking, CustomerBookingHistoryFilters } from '../types';
import styles from './CustomerBookingHistory.module.css';

const MIN_TABLE_WIDTH = 1100;

/**
 * Tab "Lịch sử thuê" của hồ sơ khách — Figma Partner-XePrime `23797:54015` (02/11/2026).
 *
 * Tìm (mã đơn · tên xe · biển số), trạng thái và khoảng ngày nhận xe đều lọc ở SERVER; phân trang
 * cũng vậy — khách quen của shop lớn có hàng trăm chuyến. Bấm một dòng (hoặc biểu tượng mắt) mở
 * "Chi tiết đơn" ngay dưới bảng: xem nhanh tiền và lịch mà không rời hồ sơ khách.
 */
export function CustomerBookingHistory({
  customerId,
  canViewFinance,
  canOpenBooking,
}: {
  customerId: string;
  canViewFinance: boolean;
  canOpenBooking: boolean;
}) {
  const t = useTranslations('Customers.profile.history');
  const tDriver = useTranslations('Bookings.driver');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const [filters, setFilters] = useState<CustomerBookingHistoryFilters>({ page: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isFetching, isError, refetch } = useCustomerBookingHistory(customerId, filters);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: filters.page,
    limit: CUSTOMER_HISTORY_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const selected = items.find((row) => row.id === selectedId) ?? null;
  const hasFilters = Boolean(filters.q || filters.status || filters.from || filters.to);

  const fields: readonly FilterField[] = [
    { kind: 'search', key: 'q', label: t('searchPlaceholder'), placeholder: t('searchPlaceholder') },
    {
      kind: 'select',
      key: 'status',
      label: t('status'),
      allowClear: true,
      options: BOOKING_STATUS_VALUES.map((value) => ({ value, label: dl('bookingStatus', value) })),
    },
    { kind: 'dateRange', fromKey: 'from', toKey: 'to', label: t('time') },
  ];

  function changeFilters(patch: FilterValues) {
    // Ô tìm kiếm báo lại cả giá trị KHÔNG đổi (lượt debounce đầu) — bỏ qua, kẻo xoá dòng đang xem.
    const current: FilterValues = { q: filters.q, status: filters.status, from: filters.from, to: filters.to };
    if (Object.entries(patch).every(([key, value]) => current[key] === value)) return;
    // Đổi bộ lọc là một tập kết quả MỚI — về trang 1, bỏ dòng đang xem nhanh.
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
    setSelectedId(null);
  }

  const columns: DataTableColumn<CustomerBooking>[] = [
    {
      title: t('colBooking'),
      key: 'code',
      width: 140,
      render: (_, row) => <span className={styles.code}>{row.code}</span>,
    },
    {
      title: t('colVehicle'),
      key: 'vehicle',
      width: 220,
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.vehicleName}>{row.vehicleName}</span>
          {row.vehiclePlate ? <span className={styles.meta}>{row.vehiclePlate}</span> : null}
        </div>
      ),
    },
    {
      title: t('colTime'),
      key: 'range',
      width: 220,
      render: (_, row) => (
        <div className={styles.stack}>
          <span>
            <span className={styles.meta}>{t('pickupAt')}</span> {fmt.shortDateTime(row.pickupAt)}
          </span>
          <span>
            <span className={styles.meta}>{t('returnAt')}</span> {fmt.shortDateTime(row.returnAt)}
          </span>
        </div>
      ),
    },
    {
      title: t('colService'),
      key: 'service',
      width: 130,
      render: (_, row) => dl('serviceType', row.serviceType),
    },
    {
      title: tDriver('title'),
      key: 'driver',
      width: 160,
      render: (_, row) =>
        row.driver || row.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
          <BookingDriverCell booking={row} />
        ) : (
          <span className={styles.meta}>—</span>
        ),
    },
    {
      title: t('colStatus'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusBadge
          value={row.status as BookingStatus}
          meta={BOOKING_STATUS_META}
          group="bookingStatus"
        />
      ),
    },
    ...(canViewFinance
      ? ([
          {
            title: t('colTotal'),
            key: 'total',
            width: 140,
            align: 'right',
            render: (_, row) => <b className={styles.money}>{fmt.money(row.totalAmount)}</b>,
          },
        ] as DataTableColumn<CustomerBooking>[])
      : []),
    {
      title: t('colActions'),
      key: 'actions',
      width: 90,
      align: 'center',
      render: (_, row) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          aria-label={t('preview', { code: row.code })}
          aria-pressed={row.id === selectedId}
          className={cx(row.id === selectedId && styles.eyeActive)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(row.id === selectedId ? null : row.id);
          }}
        />
      ),
    },
  ];

  return (
    <div className={styles.wrap}>
      <SectionCard title={t('title')}>
        <FilterBar
          fields={fields}
          values={{ q: filters.q, status: filters.status, from: filters.from, to: filters.to }}
          onChange={changeFilters}
          onClear={
            hasFilters
              ? () => {
                  setFilters({ page: 1 });
                  setSelectedId(null);
                }
              : undefined
          }
          searchDebounceMs={300}
        />
        <DataTable<CustomerBooking>
          label={t('title')}
          columns={columns}
          items={items}
          minWidth={MIN_TABLE_WIDTH}
          loading={isFetching}
          error={isError && !data ? { title: t('errorTitle'), onRetry: () => void refetch() } : null}
          filtered={hasFilters}
          empty={{ title: t('emptyTitle'), description: t('emptyBody') }}
          noResults={{ title: t('emptyTitle'), description: t('emptyBody') }}
          onRowClick={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
          pagination={{
            meta,
            onChange: (page) => {
              setFilters((prev) => ({ ...prev, page }));
              setSelectedId(null);
            },
            totalLabel: (total) => t('totalLabel', { count: total }),
          }}
        />
      </SectionCard>

      {selected ? (
        <BookingPreview booking={selected} canViewFinance={canViewFinance} canOpen={canOpenBooking} />
      ) : null}
    </div>
  );
}

/** "Chi tiết đơn …" — xem nhanh một dòng của bảng, kèm lối sang trang đơn. */
export function BookingPreview({
  booking,
  canViewFinance,
  canOpen,
  title,
  extra,
  className,
}: {
  booking: CustomerBooking;
  canViewFinance: boolean;
  canOpen: boolean;
  /** Mặc định "Chi tiết đơn {mã}". */
  title?: string;
  extra?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations('Customers.profile.history');
  const tCurrent = useTranslations('Customers.profile.current');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const status = booking.status as BookingStatus;
  const awaiting = status === BOOKING_STATUS.RESERVED || status === BOOKING_STATUS.CONFIRMED;
  const renting = status === BOOKING_STATUS.ACTIVE;

  return (
    <SectionCard
      className={className}
      title={title ?? t('previewTitle', { code: booking.code })}
      extra={extra ?? <span className={styles.meta}>{t('previewHint')}</span>}
    >
      <div className={styles.previewHead}>
        <span className={styles.thumb}>
          {booking.vehicleImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={booking.vehicleImageUrl} alt="" className={styles.thumbImage} loading="lazy" />
          ) : (
            <CarOutlined aria-hidden="true" />
          )}
        </span>
        <div className={styles.previewText}>
          <span className={styles.previewName}>{booking.vehicleName}</span>
          <span className={styles.meta}>
            {[booking.vehiclePlate, booking.code, dl('serviceType', booking.serviceType)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <StatusBadge value={status} meta={BOOKING_STATUS_META} group="bookingStatus" />
      </div>
      <dl className={styles.previewFacts}>
        <div>
          <dt>{tCurrent('pickup')}</dt>
          <dd>{fmt.shortDateTime(booking.pickupAt)}</dd>
        </div>
        <div>
          <dt>{tCurrent('return')}</dt>
          <dd>{fmt.shortDateTime(booking.returnAt)}</dd>
        </div>
        <div>
          <dt>{t('duration')}</dt>
          <dd>{fmt.rentalDuration(dayjs(booking.pickupAt), dayjs(booking.returnAt))}</dd>
        </div>
        {canViewFinance ? (
          <>
            <div>
              <dt>{tCurrent('total')}</dt>
              <dd>{fmt.money(booking.totalAmount)}</dd>
            </div>
            <div>
              <dt>{t('paid')}</dt>
              <dd>{fmt.money(booking.paidAmount)}</dd>
            </div>
            <div>
              <dt>{t('remaining')}</dt>
              <dd className={cx(!isZeroMoney(booking.debtAmount) && styles.debt)}>
                {fmt.money(booking.debtAmount)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <div className={styles.previewFoot}>
        {awaiting || renting ? (
          <span>
            <span className={styles.meta}>{tCurrent('next')}</span>{' '}
            {awaiting ? tCurrent('nextAwaiting') : tCurrent('nextRenting')}
          </span>
        ) : (
          <span />
        )}
        {canOpen ? (
          <Link href={bookingPath.detail(booking.id)} className={styles.openLink}>
            {tCurrent('viewBooking')} <ArrowRightOutlined />
          </Link>
        ) : null}
      </div>
    </SectionCard>
  );
}
