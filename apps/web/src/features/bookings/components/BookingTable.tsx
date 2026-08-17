'use client';

import { CarOutlined, EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { BOOKING_STATUS_META, type BookingStatus, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatShortDateTimeRange } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { BookingListItem } from '../types';
import styles from './BookingTable.module.css';

interface BookingTableProps {
  items: BookingListItem[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  /** Nút tạo đơn đầu tiên — trang quyết theo quyền `BOOKING_CREATE`. */
  emptyAction?: React.ReactNode;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 1050px cho bảng Bookings (10 cột); code có 6 cột. */
const MIN_TABLE_WIDTH = 1060;

export function BookingTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  onView,
  onPageChange,
}: BookingTableProps) {
  const columns: DataTableColumn<BookingListItem>[] = [
    {
      title: 'Khách hàng',
      key: 'customer',
      width: 240,
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.customerName}</div>
          <div className={styles.meta}>
            {row.code}
            {row.customerPhone ? ` · ${row.customerPhone}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Xe',
      key: 'vehicle',
      width: 220,
      render: (_, row) => (
        <div className={styles.cell}>
          <CarOutlined className={styles.carIcon} aria-hidden="true" />
          <div>
            <div className={styles.name}>{row.vehicleName}</div>
            {row.vehiclePlate ? <div className={styles.meta}>{row.vehiclePlate}</div> : null}
          </div>
        </div>
      ),
    },
    {
      title: 'Thời gian thuê',
      key: 'period',
      width: 260,
      render: (_, row) => (
        <span className={styles.period}>
          {formatShortDateTimeRange(row.pickupAt, row.returnAt)}
        </span>
      ),
    },
    {
      title: 'Tổng tiền',
      key: 'total',
      align: 'right',
      width: 140,
      render: (_, row) => <span className={styles.price}>{formatMoneyVnd(row.totalAmount)}</span>,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 140,
      render: (_, row) => (
        <StatusTag value={row.status as BookingStatus} meta={BOOKING_STATUS_META} />
      ),
    },
    actionColumn<BookingListItem>((row) => [
      {
        key: 'view',
        label: 'Xem chi tiết',
        icon: <EyeOutlined />,
        onClick: () => onView(row.id),
      },
    ]),
  ];

  return (
    <DataTable<BookingListItem>
      label="Danh sách đơn thuê"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={
        error
          ? {
              title: 'Không tải được danh sách đơn',
              description: 'Có lỗi khi lấy dữ liệu. Vui lòng thử lại.',
              onRetry: error.onRetry,
            }
          : null
      }
      filtered={filtered}
      empty={{ title: 'Gian hàng chưa có đơn thuê nào', action: emptyAction }}
      noResults={{
        title: 'Không tìm thấy đơn khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      onRowClick={(row) => onView(row.id)}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} đơn` }}
    />
  );
}
