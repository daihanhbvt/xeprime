'use client';

import { CheckOutlined, StopOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import {
  PAYMENT_METHOD_META, RECEIPT_STATUS, RECEIPT_STATUS_META, RECEIPT_TYPE, RECEIPT_TYPE_META, type PaginationMeta, type PaymentMethod, type ReceiptStatus, type ReceiptType, } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { Receipt } from '../types';
import styles from './ReceiptTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface ReceiptTableProps {
  items: Receipt[];
  meta: PaginationMeta;
  loading: boolean;
  canApprove: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  /** Nút tạo phiếu đầu tiên — trang quyết theo quyền `RECEIPT_CREATE`. */
  emptyAction?: ReactNode;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Suy từ tổng bề rộng cột (P25) — 8 cột, một cột tiền và hai cột trạng thái. */
const MIN_TABLE_WIDTH = 1120;

export function ReceiptTable({
  items,
  meta,
  loading,
  canApprove,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  onApprove,
  onCancel,
  onPageChange,
}: ReceiptTableProps) {
  const fmt = useAppFormat();

  const columns: DataTableColumn<Receipt>[] = [
    {
      title: 'Phiếu',
      key: 'receipt',
      width: 150,
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.receiptNo ?? '—'}</div>
          <div className={styles.meta}>{fmt.date(row.createdAt)}</div>
        </div>
      ),
    },
    {
      title: 'Loại',
      key: 'type',
      width: 110,
      render: (_, row) => <StatusTag value={row.type as ReceiptType} meta={RECEIPT_TYPE_META} group="receiptType" />,
    },
    { title: 'Danh mục', key: 'category', width: 150, render: (_, row) => row.categoryName ?? '—' },
    {
      title: 'Diễn giải',
      key: 'description',
      width: 260,
      render: (_, row) => <span className={styles.desc}>{row.description ?? '—'}</span>,
    },
    {
      title: 'Số tiền',
      key: 'amount',
      align: 'right',
      width: 150,
      render: (_, row) => (
        // Dấu +/− là THÔNG TIN nghiệp vụ (thu vs chi), không phải trang trí — giữ nguyên.
        <span className={row.type === RECEIPT_TYPE.INCOME ? styles.income : styles.expense}>
          {row.type === RECEIPT_TYPE.INCOME ? '+' : '−'}
          {fmt.money(row.amount)}
        </span>
      ),
    },
    {
      title: 'Hình thức',
      key: 'method',
      width: 130,
      render: (_, row) =>
        PAYMENT_METHOD_META[row.paymentMethod as PaymentMethod]?.label ?? row.paymentMethod,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as ReceiptStatus} meta={RECEIPT_STATUS_META} group="receiptStatus" />
      ),
    },
    // Toàn bộ cột hành động biến mất khi thiếu `finance.receipt.approve` — quyền do trang truyền
    // xuống, `RowActions` chỉ ẩn/hiện. Cả hai hành động đều đụng tiền nên đều phải xác nhận.
    actionColumn<Receipt>(
      (row) => [
        {
          key: 'approve',
          label: 'Duyệt',
          icon: <CheckOutlined />,
          hidden:
            !canApprove ||
            !(
              row.status === RECEIPT_STATUS.PENDING_APPROVAL || row.status === RECEIPT_STATUS.DRAFT
            ),
          confirm: { title: 'Duyệt phiếu này?', okText: 'Duyệt' },
          onClick: () => onApprove(row.id),
        },
        {
          key: 'cancel',
          label: 'Huỷ',
          icon: <StopOutlined />,
          danger: true,
          hidden: !canApprove || row.status === RECEIPT_STATUS.CANCELLED,
          confirm: { title: 'Huỷ phiếu này?', okText: 'Huỷ phiếu' },
          onClick: () => onCancel(row.id),
        },
      ],
      { width: 220, maxInline: 2 },
    ),
  ];

  return (
    <DataTable<Receipt>
      label="Danh sách phiếu thu chi"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách phiếu', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có phiếu thu/chi nào', action: emptyAction }}
      noResults={{
        title: 'Không có phiếu khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} phiếu` }}
    />
  );
}
