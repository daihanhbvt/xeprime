'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import {
  BOOKING_STATUS_META, TENANT_STATUS, TENANT_STATUS_META, type BookingStatus, type PaginationMeta, type TenantStatus, } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { isZeroMoney } from '@/lib/money';
import type { AdminBooking } from '../types';
import styles from './AdminBookingTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface AdminBookingTableProps {
  items: AdminBooking[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 920px cho Platform Bookings; code có 8 cột với hai cột tiền. */
const MIN_TABLE_WIDTH = 1180;

export function AdminBookingTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AdminBookingTableProps) {
  const fmt = useAppFormat();

  const columns: DataTableColumn<AdminBooking>[] = [
    {
      title: 'Đơn',
      key: 'code',
      width: 150,
      render: (_, r) => (
        <div>
          <div className={styles.code}>{r.code}</div>
          <div className={styles.meta}>{fmt.dateTime(r.createdAt)}</div>
        </div>
      ),
    },
    {
      title: 'Khách',
      key: 'customer',
      width: 170,
      render: (_, r) => (
        <div>
          <div>{r.customerName}</div>
          {/* SĐT LUÔN ở dạng đã che; bỏ che là hành động riêng có ghi audit, nằm trong panel chi tiết. */}
          <div className={styles.meta}>{r.customerPhoneMasked ?? '—'}</div>
        </div>
      ),
    },
    {
      title: 'Gian hàng · xe',
      key: 'tenant',
      width: 230,
      render: (_, r) => (
        <div>
          <div className={styles.tenantName}>
            {r.tenantName}
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag value={r.tenantStatus as TenantStatus} meta={TENANT_STATUS_META} group="tenantStatus" />
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
      width: 260,
      render: (_, r) => fmt.shortDateTimeRange(r.pickupAt, r.returnAt),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, r) => <StatusTag value={r.status as BookingStatus} meta={BOOKING_STATUS_META} group="bookingStatus" />,
    },
    {
      title: 'Tổng tiền',
      key: 'totalAmount',
      align: 'right',
      width: 130,
      render: (_, r) => fmt.money(r.totalAmount),
    },
    {
      title: 'Còn nợ',
      key: 'debtAmount',
      align: 'right',
      width: 120,
      render: (_, r) => (
        <span className={isZeroMoney(r.debtAmount) ? undefined : styles.debt}>
          {fmt.money(r.debtAmount)}
        </span>
      ),
    },
    actionColumn<AdminBooking>((row) => [
      { key: 'view', label: 'Xem chi tiết', icon: <EyeOutlined />, onClick: () => onView(row.id) },
    ]),
  ];

  return (
    <DataTable<AdminBooking>
      label="Đơn thuê toàn hệ thống"
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách đơn thuê', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có đơn thuê nào' }}
      noResults={{
        title: 'Không có đơn khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} đơn` }}
    />
  );
}
