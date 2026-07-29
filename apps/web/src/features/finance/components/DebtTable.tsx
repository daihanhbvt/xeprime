'use client';

import { DollarOutlined } from '@ant-design/icons';
import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { PaginationMeta } from '@xeprime/types';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { DebtItem } from '../types';
import styles from './DebtTable.module.css';

interface DebtTableProps {
  items: DebtItem[];
  meta: PaginationMeta;
  loading: boolean;
  canRecord: boolean;
  onCollect: (row: DebtItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function DebtTable({ items, meta, loading, canRecord, onCollect, onPageChange }: DebtTableProps) {
  const columns: ColumnsType<DebtItem> = [
    {
      title: 'Đơn',
      key: 'booking',
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.customerName}</div>
          <div className={styles.meta}>
            {r.code}
            {r.customerPhone ? ` · ${r.customerPhone}` : ''}
          </div>
        </div>
      ),
    },
    { title: 'Xe', key: 'vehicle', render: (_, r) => r.vehicleName },
    {
      title: 'Đến hạn trả',
      key: 'returnAt',
      render: (_, r) => formatDate(r.returnAt),
    },
    { title: 'Tổng', key: 'total', align: 'right', render: (_, r) => formatMoneyVnd(r.totalAmount) },
    { title: 'Đã trả', key: 'paid', align: 'right', render: (_, r) => formatMoneyVnd(r.paidAmount) },
    {
      title: 'Còn nợ',
      key: 'debt',
      align: 'right',
      render: (_, r) => <span className={styles.debt}>{formatMoneyVnd(r.debtAmount)}</span>,
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, r) =>
        canRecord ? (
          <Button type="link" size="small" icon={<DollarOutlined />} onClick={() => onCollect(r)}>
            Thu tiền
          </Button>
        ) : null,
    },
  ];

  return (
    <Table<DebtItem>
      rowKey="bookingId"
      columns={columns}
      dataSource={items}
      loading={loading}
      scroll={{ x: 'max-content' }}
      pagination={{
        current: meta.page,
        pageSize: meta.limit,
        total: meta.total,
        showSizeChanger: true,
        showTotal: (total) => `${total} đơn còn nợ`,
        onChange: onPageChange,
      }}
    />
  );
}
