'use client';

import { DollarOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { DebtItem } from '../types';
import styles from './DebtTable.module.css';

interface DebtTableProps {
  items: DebtItem[];
  meta: PaginationMeta;
  loading: boolean;
  canRecord: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onCollect: (row: DebtItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 900px cho bảng Debts. */
const MIN_TABLE_WIDTH = 960;

export function DebtTable({
  items,
  meta,
  loading,
  canRecord,
  error = null,
  filtered = false,
  onClearFilters,
  onCollect,
  onPageChange,
}: DebtTableProps) {
  const columns: DataTableColumn<DebtItem>[] = [
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
    { title: 'Xe', key: 'vehicle', width: 180, render: (_, r) => r.vehicleName },
    { title: 'Đến hạn trả', key: 'returnAt', width: 130, render: (_, r) => formatDate(r.returnAt) },
    {
      title: 'Tổng',
      key: 'total',
      align: 'right',
      width: 130,
      render: (_, r) => formatMoneyVnd(r.totalAmount),
    },
    {
      title: 'Đã trả',
      key: 'paid',
      align: 'right',
      width: 130,
      render: (_, r) => formatMoneyVnd(r.paidAmount),
    },
    {
      title: 'Còn nợ',
      key: 'debt',
      align: 'right',
      width: 130,
      render: (_, r) => <span className={styles.debt}>{formatMoneyVnd(r.debtAmount)}</span>,
    },
    // Quyền do trang quyết (`canRecord` từ `PAYMENT_RECORD`); `RowActions` chỉ ẩn/hiện theo cờ.
    actionColumn<DebtItem>(
      (r) => [
        {
          key: 'collect',
          label: 'Thu tiền',
          showLabel: true,
          icon: <DollarOutlined />,
          hidden: !canRecord,
          onClick: () => onCollect(r),
        },
      ],
      { width: 140 },
    ),
  ];

  return (
    <DataTable<DebtItem>
      label="Danh sách công nợ"
      columns={columns}
      items={items}
      rowKey={(row) => row.bookingId}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={
        error
          ? {
              title: 'Không tải được công nợ',
              description: 'Có lỗi khi lấy dữ liệu. Vui lòng thử lại.',
              onRetry: error.onRetry,
            }
          : null
      }
      filtered={filtered}
      empty={{ title: 'Không có đơn nào còn nợ' }}
      noResults={{
        title: 'Không có khoản nợ khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} đơn còn nợ` }}
    />
  );
}
