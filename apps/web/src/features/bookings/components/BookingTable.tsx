'use client';

import { CarOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BOOKING_STATUS_META, type BookingStatus, type PaginationMeta } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTimeRange } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { BookingListItem } from '../types';
import styles from './BookingTable.module.css';

interface BookingTableProps {
  items: BookingListItem[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function BookingTable({ items, meta, loading, onView, onPageChange }: BookingTableProps) {
  const columns: ColumnsType<BookingListItem> = [
    {
      title: 'Khách hàng',
      key: 'customer',
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
      render: (_, row) => (
        <div className={styles.cell}>
          <CarOutlined className={styles.carIcon} />
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
      render: (_, row) => <span className={styles.period}>{formatDateTimeRange(row.pickupAt, row.returnAt)}</span>,
    },
    {
      title: 'Tổng tiền',
      key: 'total',
      align: 'right',
      render: (_, row) => <span className={styles.price}>{formatMoneyVnd(row.totalAmount)}</span>,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, row) => (
        <StatusTag value={row.status as BookingStatus} meta={BOOKING_STATUS_META} />
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      width: 60,
      render: (_, row) => (
        <Button type="text" icon={<EyeOutlined />} aria-label="Xem" onClick={() => onView(row.id)} />
      ),
    },
  ];

  return (
    <Table<BookingListItem>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      scroll={{ x: 'max-content' }}
      onRow={(row) => ({ onClick: () => onView(row.id), className: styles.rowClickable })}
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
