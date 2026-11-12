'use client';

import { DollarOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { BOOKING_STATUS_META, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { overdueDays } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DebtItem } from '../types';
import styles from './DebtTable.module.css';

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

/** Bảy cột theo design `23857:58932`. */
const MIN_TABLE_WIDTH = 1180;

/**
 * Phần đã trả trên phải thu, làm tròn xuống tới 1% — CHỈ để vẽ thanh tiến độ, không phải một con số
 * tiền (hai con số tiền vẫn in đủ bên dưới, từ server). Chia trên `Number` là được ở đây vì kết
 * quả chỉ quyết độ dài một vạch màu.
 */
function paidPercent(paid: string, total: string): number {
  const p = Number(paid);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((p / t) * 100)));
}

/**
 * Bảng công nợ — tab "Công nợ" của Lịch sử giao dịch (design Partner-XePrime `23857:58932`):
 * Khách hàng · Đơn hàng · Trạng thái đơn · Phương tiện · Hạn trả · Còn nợ · Thao tác.
 *
 * Trạng thái đơn đứng ngay sau mã đơn, không nhét cuối bảng: một đơn chưa giao xe còn nợ là
 * chuyện bình thường, không phải việc phải đi đòi — người thu thấy trạng thái trước khi thấy con
 * số. Màu lấy từ `BOOKING_STATUS_META` dùng chung (ADR 0005).
 *
 * "Quá N ngày" tính bằng CHÍNH mốc của server (`overdueDays`: hạn đã trôi qua, phần ngày lẻ tròn
 * lên), nên dòng mang chữ đỏ là đúng dòng nằm trong nhóm "Quá hạn".
 */
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
  const now = new Date();

  const columns: DataTableColumn<DebtItem>[] = [
    {
      title: t('columns.customer'),
      key: 'customer',
      width: 200,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.name}>{r.customerName}</span>
          {r.customerPhone ? <span className={styles.meta}>{r.customerPhone}</span> : null}
        </div>
      ),
    },
    { title: t('columns.order'), key: 'code', width: 150, render: (_, r) => r.code },
    {
      title: t('columns.status'),
      key: 'status',
      width: 140,
      render: (_, r) => (
        <StatusTag value={r.status} meta={BOOKING_STATUS_META} group="bookingStatus" />
      ),
    },
    {
      title: t('columns.vehicleFull'),
      key: 'vehicle',
      width: 190,
      render: (_, r) => (
        <div className={styles.stack}>
          <span>{r.vehicleName}</span>
          {r.plateNumber ? <span className={styles.meta}>{r.plateNumber}</span> : null}
        </div>
      ),
    },
    {
      title: t('columns.dueAt'),
      key: 'returnAt',
      width: 130,
      render: (_, r) => {
        const late = overdueDays(r.returnAt, now);
        return (
          <div className={styles.stack}>
            <span>{fmt.date(r.returnAt)}</span>
            {late > 0 ? <span className={styles.late}>{t('overdueDays', { count: late })}</span> : null}
          </div>
        );
      },
    },
    {
      title: t('columns.debt'),
      key: 'debt',
      width: 260,
      render: (_, r) => {
        const percent = paidPercent(r.paidAmount, r.totalAmount);
        return (
          <div className={styles.debtCell}>
            <span className={styles.debt}>{fmt.money(r.debtAmount)}</span>
            {/* Độ dài vạch chỉ biết lúc chạy → CSS custom property (ngoại lệ ADR 0003). */}
            <span
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t('paidProgress', { percent })}
              style={{ '--xp-paid-width': `${percent}%` } as CSSProperties}
            >
              <span className={styles.bar} />
            </span>
            <span className={styles.meta}>
              {t('paidOf', { paid: fmt.money(r.paidAmount), total: fmt.money(r.totalAmount) })}
            </span>
          </div>
        );
      },
    },
    // Quyền do trang quyết (`canRecord` từ `PAYMENT_RECORD`, `canView` từ `BOOKING_VIEW`);
    // `RowActions` chỉ ẩn/hiện theo cờ.
    actionColumn<DebtItem>(
      (r) => [
        {
          key: 'view',
          label: t('actions.view'),
          showLabel: true,
          // Nút phụ: chỉ "Thu tiền" mang màu nhấn (RowActions tô nút đầu nếu không khai).
          primary: false,
          hidden: !canView,
          onClick: () => onView(r),
        },
        {
          key: 'collect',
          label: t('actions.collect'),
          icon: <DollarOutlined />,
          showLabel: true,
          primary: true,
          hidden: !canRecord,
          onClick: () => onCollect(r),
        },
      ],
      { width: 220, maxInline: 2, title: t('columns.actions'), variant: 'standard' },
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
