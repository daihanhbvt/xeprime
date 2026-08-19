'use client';

import { DollarOutlined, EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import type { PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ROUTES } from '@/constants/routes';
import type { DebtItem } from '../types';
import styles from './DebtTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

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
  const fmt = useAppFormat();

  const router = useRouter();
  const bookingHref = (bookingId: string) => `${ROUTES.MANAGE.BOOKINGS}?booking=${bookingId}`;
  const columns: DataTableColumn<DebtItem>[] = [
    {
      title: 'Đơn',
      key: 'booking',
      width: 240,
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
    { title: 'Đến hạn trả', key: 'returnAt', width: 130, render: (_, r) => fmt.date(r.returnAt) },
    {
      title: 'Tổng',
      key: 'total',
      align: 'right',
      width: 130,
      render: (_, r) => fmt.money(r.totalAmount),
    },
    {
      title: 'Đã trả',
      key: 'paid',
      align: 'right',
      width: 130,
      render: (_, r) => fmt.money(r.paidAmount),
    },
    {
      title: 'Còn nợ',
      key: 'debt',
      align: 'right',
      width: 130,
      render: (_, r) => <span className={styles.debt}>{fmt.money(r.debtAmount)}</span>,
    },
    // Quyền do trang quyết (`canRecord` từ `PAYMENT_RECORD`); `RowActions` chỉ ẩn/hiện theo cờ.
    actionColumn<DebtItem>(
      (r) => [
        {
          key: 'view',
          label: 'Xem đơn',
          icon: <EyeOutlined />,
          onClick: () => router.push(bookingHref(r.bookingId)),
        },
        {
          key: 'collect',
          label: 'Thu tiền',
          icon: <DollarOutlined />,
          hidden: !canRecord,
          onClick: () => onCollect(r),
        },
      ],
      { width: 260, maxInline: 2 },
    ),
  ];

  return (
    <DataTable<DebtItem>
      label="Danh sách công nợ"
      columns={columns}
      items={items}
      rowKey={(row) => row.bookingId}
      onRowClick={(row) => router.push(bookingHref(row.bookingId))}
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
