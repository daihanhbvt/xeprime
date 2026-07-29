'use client';

import { Button, Popconfirm, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PAYMENT_METHOD_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE,
  RECEIPT_TYPE_META,
  type PaginationMeta,
  type PaymentMethod,
  type ReceiptStatus,
  type ReceiptType,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { Receipt } from '../types';
import styles from './ReceiptTable.module.css';

interface ReceiptTableProps {
  items: Receipt[];
  meta: PaginationMeta;
  loading: boolean;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function ReceiptTable({
  items,
  meta,
  loading,
  canApprove,
  onApprove,
  onCancel,
  onPageChange,
}: ReceiptTableProps) {
  const columns: ColumnsType<Receipt> = [
    {
      title: 'Phiếu',
      key: 'receipt',
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.receiptNo ?? '—'}</div>
          <div className={styles.meta}>{formatDate(row.createdAt)}</div>
        </div>
      ),
    },
    {
      title: 'Loại',
      key: 'type',
      render: (_, row) => (
        <StatusTag value={row.type as ReceiptType} meta={RECEIPT_TYPE_META} />
      ),
    },
    {
      title: 'Danh mục',
      key: 'category',
      render: (_, row) => row.categoryName ?? '—',
    },
    {
      title: 'Diễn giải',
      key: 'description',
      render: (_, row) => <span className={styles.desc}>{row.description ?? '—'}</span>,
    },
    {
      title: 'Số tiền',
      key: 'amount',
      align: 'right',
      render: (_, row) => (
        <span className={row.type === RECEIPT_TYPE.INCOME ? styles.income : styles.expense}>
          {row.type === RECEIPT_TYPE.INCOME ? '+' : '−'}
          {formatMoneyVnd(row.amount)}
        </span>
      ),
    },
    {
      title: 'Hình thức',
      key: 'method',
      render: (_, row) => PAYMENT_METHOD_META[row.paymentMethod as PaymentMethod]?.label ?? row.paymentMethod,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, row) => (
        <StatusTag value={row.status as ReceiptStatus} meta={RECEIPT_STATUS_META} />
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, row) =>
        canApprove ? (
          <div className={styles.actions}>
            {row.status === RECEIPT_STATUS.PENDING_APPROVAL || row.status === RECEIPT_STATUS.DRAFT ? (
              <Popconfirm title="Duyệt phiếu này?" onConfirm={() => onApprove(row.id)} okText="Duyệt">
                <Button type="link" size="small">
                  Duyệt
                </Button>
              </Popconfirm>
            ) : null}
            {row.status !== RECEIPT_STATUS.CANCELLED ? (
              <Popconfirm title="Huỷ phiếu này?" onConfirm={() => onCancel(row.id)} okText="Huỷ phiếu" okButtonProps={{ danger: true }}>
                <Button type="link" size="small" danger>
                  Huỷ
                </Button>
              </Popconfirm>
            ) : null}
          </div>
        ) : null,
    },
  ];

  return (
    <Table<Receipt>
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
        showTotal: (total) => `${total} phiếu`,
        onChange: onPageChange,
      }}
    />
  );
}
