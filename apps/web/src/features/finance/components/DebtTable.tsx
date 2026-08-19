'use client';

import { DollarOutlined, EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS_META, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { DebtItem } from '../types';
import styles from './DebtTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface DebtTableProps {
  items: DebtItem[];
  meta: PaginationMeta;
  loading: boolean;
  canRecord: boolean;
  canView: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (row: DebtItem) => void;
  onCollect: (row: DebtItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 900px cho bảng Debts; cột trạng thái (19/08) đẩy lên 1120. */
const MIN_TABLE_WIDTH = 1120;

export function DebtTable({
  items,
  meta,
  loading,
  canRecord,
  canView,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onCollect,
  onPageChange,
}: DebtTableProps) {
  const fmt = useAppFormat();
  const t = useTranslations('Finance.debts.table');
  const tCommon = useTranslations('Common');

  const columns: DataTableColumn<DebtItem>[] = [
    {
      title: t('columns.booking'),
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
    /*
     * Trạng thái đứng NGAY sau tên khách, không nhét cuối bảng: bảng này toàn số tiền trông
     * giống nhau, và một đơn `reserved`/`confirmed` (xe chưa ra khỏi bãi) còn nợ là chuyện
     * bình thường — không phải việc phải đi đòi. Đọc từ trái sang, người thu thấy trạng thái
     * trước khi thấy con số, nên không còn cảnh nhìn cả cột "còn nợ" rồi tưởng tất cả đều là
     * tiền chưa thu được.
     *
     * Màu lấy từ `BOOKING_STATUS_META` dùng chung (ADR 0005) — cùng một trạng thái ở lịch, ở
     * chi tiết đơn và ở đây luôn ra cùng màu; KHÔNG tự pha bảng màu riêng cho màn công nợ.
     */
    {
      title: tCommon('labels.status'),
      key: 'status',
      width: 150,
      render: (_, r) => (
        <StatusTag value={r.status} meta={BOOKING_STATUS_META} group="bookingStatus" />
      ),
    },
    { title: t('columns.vehicle'), key: 'vehicle', width: 180, render: (_, r) => r.vehicleName },
    {
      title: t('columns.returnAt'),
      key: 'returnAt',
      width: 130,
      render: (_, r) => fmt.date(r.returnAt),
    },
    {
      title: t('columns.total'),
      key: 'total',
      align: 'right',
      width: 130,
      render: (_, r) => fmt.money(r.totalAmount),
    },
    {
      title: t('columns.paid'),
      key: 'paid',
      align: 'right',
      width: 130,
      render: (_, r) => fmt.money(r.paidAmount),
    },
    {
      title: t('columns.debt'),
      key: 'debt',
      align: 'right',
      width: 130,
      render: (_, r) => <span className={styles.debt}>{fmt.money(r.debtAmount)}</span>,
    },
    // Quyền do trang quyết (`canRecord` từ `PAYMENT_RECORD`, `canView` từ `BOOKING_VIEW`);
    // `RowActions` chỉ ẩn/hiện theo cờ.
    actionColumn<DebtItem>(
      (r) => [
        {
          key: 'view',
          label: t('actions.view'),
          icon: <EyeOutlined />,
          hidden: !canView,
          onClick: () => onView(r),
        },
        {
          key: 'collect',
          label: t('actions.collect'),
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
      label={t('label')}
      columns={columns}
      items={items}
      rowKey={(row) => row.bookingId}
      onRowClick={canView ? onView : undefined}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={
        error
          ? {
              title: t('error.title'),
              description: t('error.description'),
              onRetry: error.onRetry,
            }
          : null
      }
      filtered={filtered}
      empty={{ title: t('empty.title') }}
      noResults={{
        title: t('noResults.title'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('totalLabel', { count: total }),
      }}
    />
  );
}
