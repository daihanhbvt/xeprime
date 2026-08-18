'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  BOOKING_STATUS_META,
  SERVICE_TYPE_LABEL,
  type BookingStatus,
  type ServiceType,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { bookingPath } from '@/constants/routes';
import { formatDateTimeRange, formatShortDateTime } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import { cx } from '@/lib/cx';
import { CUSTOMER_HISTORY_DEFAULT_LIMIT } from '../api';
import { useCustomerBookings } from '../hooks/use-customers';
import type { CustomerBooking } from '../types';
import styles from './CustomerBookingHistory.module.css';

const MIN_TABLE_WIDTH = 900;

/**
 * Lịch sử thuê của một khách — phân trang SERVER, không tải hết rồi cắt ở client: một khách
 * quen của shop lớn có hàng trăm chuyến.
 *
 * Link sang chi tiết đơn chỉ xuất hiện khi người dùng có `bookings.view`; thiếu quyền thì cả
 * khối này không được render (backend cũng trả 403 cho endpoint).
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
  const [page, setPage] = useState(1);
  const { data, isFetching, isError, refetch } = useCustomerBookings(customerId, page);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: CUSTOMER_HISTORY_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };

  const columns: DataTableColumn<CustomerBooking>[] = [
    {
      title: 'Đơn thuê',
      key: 'code',
      width: 180,
      render: (_, row) =>
        canOpenBooking ? (
          <Link href={bookingPath.detail(row.id)} className={styles.code}>
            {row.code}
          </Link>
        ) : (
          <span className={styles.code}>{row.code}</span>
        ),
    },
    {
      title: 'Xe',
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
      title: 'Thời gian',
      key: 'range',
      width: 240,
      render: (_, row) => (
        <span className={styles.meta}>{formatDateTimeRange(row.pickupAt, row.returnAt)}</span>
      ),
    },
    {
      title: 'Dịch vụ',
      key: 'service',
      width: 140,
      render: (_, row) => SERVICE_TYPE_LABEL[row.serviceType as ServiceType] ?? row.serviceType,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 140,
      render: (_, row) => (
        <StatusTag value={row.status as BookingStatus} meta={BOOKING_STATUS_META} />
      ),
    },
    ...(canViewFinance
      ? ([
          {
            title: 'Tổng tiền',
            key: 'total',
            width: 150,
            align: 'right',
            render: (_, row) => (
              <span className={styles.money}>{formatMoneyVnd(row.totalAmount)}</span>
            ),
          },
          {
            title: 'Còn nợ',
            key: 'debt',
            width: 140,
            align: 'right',
            render: (_, row) => (
              <span className={cx(styles.money, !isZeroMoney(row.debtAmount) && styles.debt)}>
                {formatMoneyVnd(row.debtAmount)}
              </span>
            ),
          },
        ] as DataTableColumn<CustomerBooking>[])
      : []),
  ];

  const renderCard = (row: CustomerBooking) => (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        {canOpenBooking ? (
          <Link href={bookingPath.detail(row.id)} className={styles.code}>
            {row.code}
          </Link>
        ) : (
          <span className={styles.code}>{row.code}</span>
        )}
        <StatusTag value={row.status as BookingStatus} meta={BOOKING_STATUS_META} />
      </header>
      <div className={styles.vehicleName}>{row.vehicleName}</div>
      <div className={styles.meta}>
        {formatShortDateTime(row.pickupAt)} → {formatShortDateTime(row.returnAt)}
      </div>
      {canViewFinance ? (
        <div className={styles.cardMoney}>
          <span>{formatMoneyVnd(row.totalAmount)}</span>
          {!isZeroMoney(row.debtAmount) ? (
            <span className={styles.debt}>Còn nợ {formatMoneyVnd(row.debtAmount)}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );

  return (
    <DataTable<CustomerBooking>
      label="Lịch sử thuê của khách"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={isFetching}
      error={
        isError && !data
          ? { title: 'Không tải được lịch sử thuê', onRetry: () => void refetch() }
          : null
      }
      empty={{
        title: 'Khách chưa có chuyến nào',
        description: 'Lịch sử sẽ xuất hiện ngay khi bạn lập đơn thuê đầu tiên cho khách này.',
      }}
      renderCard={renderCard}
      pagination={{
        meta,
        onChange: (nextPage) => setPage(nextPage),
        totalLabel: (total) => `${total} chuyến`,
      }}
    />
  );
}
