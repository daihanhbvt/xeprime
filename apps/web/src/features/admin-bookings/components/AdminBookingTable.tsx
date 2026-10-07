'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS_META,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type BookingStatus,
  type PaginationMeta,
  type TenantStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { isDebtOverdue, isInDebtScope } from '../detail';
import type { AdminBooking } from '../types';
import styles from './AdminBookingTable.module.css';

interface AdminBookingTableProps {
  items: AdminBooking[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
  /**
   * Đơn đang mở ở panel chi tiết — hàng đó được tô để khi đóng panel người dùng vẫn biết mình vừa
   * xem dòng nào. Bố cục cột KHÔNG đổi theo panel (07/10/2026 — bỏ chế độ "cạnh panel" co cột và
   * đẩy trang sang trái; panel giờ là drawer chuẩn có mask).
   */
  selectedId?: string | null;
}

/**
 * Sàn bề rộng bảy cột dữ liệu + cột thao tác (Figma `127:1725` ghi 920px cho Platform Bookings;
 * code có thêm hai cột tiền). Đây là SÀN, không phải tổng: bảng `tableLayout="auto"` vẫn giãn.
 */
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
  selectedId = null,
}: AdminBookingTableProps) {
  const t = useTranslations('AdminBookings.table');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const columns: DataTableColumn<AdminBooking>[] = [
    {
      title: t('code'),
      key: 'code',
      width: 150,
      render: (_, r) => (
        <div>
          {/*
            Mã đơn là NÚT mở panel, không chỉ là chữ: cả hàng bấm được bằng chuột, nhưng `tr`
            không nhận focus — không có nút này thì người dùng bàn phím không mở được đơn nào
            khi cột thao tác đang nằm khuất dưới panel.
          */}
          <button
            type="button"
            className={styles.codeButton}
            aria-label={t('openDetail', { code: r.code })}
            onClick={() => onView(r.id)}
          >
            {r.code}
          </button>
          <div className={styles.meta}>{fmt.dateTime(r.createdAt)}</div>
        </div>
      ),
    },
    {
      title: t('customer'),
      key: 'customer',
      width: 170,
      render: (_, r) => (
        <div>
          <div className={styles.primary}>{r.customerName}</div>
          {/* SĐT LUÔN ở dạng đã che; bỏ che là hành động riêng có ghi audit, nằm trong panel chi tiết. */}
          <div className={styles.meta}>{r.customerPhoneMasked ?? tCommon('labels.emptyValue')}</div>
        </div>
      ),
    },
    {
      title: t('tenant'),
      key: 'tenant',
      width: 230,
      render: (_, r) => (
        <div>
          <div className={styles.tenantName}>
            {r.tenantName}
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag
                value={r.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
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
      title: t('period'),
      key: 'period',
      width: 260,
      render: (_, r) => (
        <span className={styles.period}>{fmt.shortDateTimeRange(r.pickupAt, r.returnAt)}</span>
      ),
    },
    {
      title: tCommon('labels.status'),
      key: 'status',
      width: 130,
      render: (_, r) => (
        <StatusTag
          value={r.status as BookingStatus}
          meta={BOOKING_STATUS_META}
          group="bookingStatus"
        />
      ),
    },
    {
      title: t('totalAmount'),
      key: 'totalAmount',
      align: 'right',
      width: 130,
      render: (_, r) => fmt.money(r.totalAmount),
    },
    {
      title: t('debtAmount'),
      key: 'debtAmount',
      align: 'right',
      width: 120,
      // Cùng luật với panel: đơn huỷ ngoài phạm vi công nợ; chỉ tô cảnh báo khoản nợ của chuyến
      // ĐÃ hoàn thành.
      render: (_, r) =>
        isInDebtScope(r) ? (
          <span className={isDebtOverdue(r) ? styles.debtOverdue : undefined}>
            {fmt.money(r.debtAmount)}
          </span>
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    actionColumn<AdminBooking>((row) => [
      {
        key: 'view',
        label: tCommon('actions.viewDetail'),
        icon: <EyeOutlined />,
        onClick: () => onView(row.id),
      },
    ]),
  ];

  return (
    <DataTable<AdminBooking>
      label={t('label')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      selectedRowKey={selectedId}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('empty') }}
      noResults={{
        title: t('noResults'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('total', { count: total }),
      }}
    />
  );
}
