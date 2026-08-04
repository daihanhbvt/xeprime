'use client';

import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BOOKING_STATUS_META,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type BookingStatus,
  type PaginationMeta,
  type TenantStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd, isZeroMoney } from '@/lib/money';
import type { AdminBooking } from '../types';
import styles from './AdminBookingTable.module.css';

interface AdminBookingTableProps {
  items: AdminBooking[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function AdminBookingTable({
  items,
  meta,
  loading,
  onView,
  onPageChange,
}: AdminBookingTableProps) {
  const columns: ColumnsType<AdminBooking> = [
    {
      title: 'Đơn',
      key: 'code',
      render: (_, r) => (
        <div>
          <div className={styles.code}>{r.code}</div>
          <div className={styles.meta}>{formatDateTime(r.createdAt)}</div>
        </div>
      ),
    },
    {
      title: 'Khách',
      key: 'customer',
      render: (_, r) => (
        <div>
          <div>{r.customerName}</div>
          <div className={styles.meta}>{r.customerPhoneMasked ?? '—'}</div>
        </div>
      ),
    },
    {
      title: 'Gian hàng · xe',
      key: 'tenant',
      render: (_, r) => (
        <div>
          <div className={styles.tenantName}>
            {r.tenantName}
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag value={r.tenantStatus as TenantStatus} meta={TENANT_STATUS_META} />
            ) : null}
          </div>
          <div className={styles.meta}>
            {r.vehicleName}
            {r.vehiclePlateNumber ? ` · ${r.vehiclePlateNumber}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Thuê từ → đến',
      key: 'period',
      render: (_, r) => (
        <div>
          <div>{formatDateTime(r.pickupAt)}</div>
          <div className={styles.meta}>{formatDateTime(r.returnAt)}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, r) => <StatusTag value={r.status as BookingStatus} meta={BOOKING_STATUS_META} />,
    },
    {
      title: 'Tổng tiền',
      key: 'totalAmount',
      align: 'right',
      render: (_, r) => formatMoneyVnd(r.totalAmount),
    },
    {
      title: 'Còn nợ',
      key: 'debtAmount',
      align: 'right',
      render: (_, r) => (
        <span className={isZeroMoney(r.debtAmount) ? undefined : styles.debt}>
          {formatMoneyVnd(r.debtAmount)}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, r) => (
        <Button type="link" onClick={() => onView(r.id)}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <Table<AdminBooking>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      scroll={{ x: 'max-content' }}
      pagination={{
        current: meta.page,
        pageSize: meta.limit,
        total: meta.total,
        showSizeChanger: true,
        showTotal: (total) => `${total} đơn`,
        onChange: onPageChange,
      }}
    />
  );
}
