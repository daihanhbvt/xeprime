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
import { useElementWidth } from '@/hooks/use-element-width';
import { useAppFormat } from '@/i18n/use-app-format';
import { isDebtOverdue, isInDebtScope } from '../detail';
import {
  ADMIN_BOOKING_COLUMN,
  FULL_TABLE_MIN_WIDTH,
  PANEL_COLUMN_WIDTH,
  panelColumnsAfterDrop,
  panelDropCount,
  panelTableMinWidth,
} from '../table-layout';
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
   * Đơn đang mở ở panel chi tiết. Có giá trị ⇒ bảng chuyển sang chế độ CẠNH PANEL: hàng đó được
   * tô, hai cột tiền + cột thao tác bị bỏ, và các cột còn lại tự ẩn bớt theo chỗ thật còn lại
   * (`table-layout.ts`).
   */
  selectedId?: string | null;
}

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
  const [measureRef, dropCount] = useElementWidth<HTMLDivElement, number>(panelDropCount);

  const withPanel = selectedId !== null;
  const panelColumns = panelColumnsAfterDrop(dropCount ?? 0);
  const hiddenInPanel = (key: keyof typeof PANEL_COLUMN_WIDTH) =>
    withPanel && !panelColumns.has(key);
  const panelWidth = (key: keyof typeof PANEL_COLUMN_WIDTH, full: number) =>
    withPanel ? PANEL_COLUMN_WIDTH[key] : full;

  const columns: DataTableColumn<AdminBooking>[] = [
    {
      title: t('code'),
      key: ADMIN_BOOKING_COLUMN.CODE,
      width: panelWidth(ADMIN_BOOKING_COLUMN.CODE, 150),
      render: (_, r) => (
        <div>
          {/*
            Mã đơn là NÚT mở panel, không chỉ là chữ: cả hàng bấm được bằng chuột, nhưng `tr`
            không nhận focus — không có nút này thì người dùng bàn phím không mở được đơn nào
            khi panel đang mở (cột thao tác bị bỏ ở chế độ cạnh panel).
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
      key: ADMIN_BOOKING_COLUMN.CUSTOMER,
      width: panelWidth(ADMIN_BOOKING_COLUMN.CUSTOMER, 170),
      hidden: hiddenInPanel(ADMIN_BOOKING_COLUMN.CUSTOMER),
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
      key: ADMIN_BOOKING_COLUMN.TENANT,
      width: panelWidth(ADMIN_BOOKING_COLUMN.TENANT, 230),
      hidden: hiddenInPanel(ADMIN_BOOKING_COLUMN.TENANT),
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
      key: ADMIN_BOOKING_COLUMN.PERIOD,
      width: panelWidth(ADMIN_BOOKING_COLUMN.PERIOD, 260),
      hidden: hiddenInPanel(ADMIN_BOOKING_COLUMN.PERIOD),
      render: (_, r) => (
        <span className={styles.period}>{fmt.shortDateTimeRange(r.pickupAt, r.returnAt)}</span>
      ),
    },
    {
      title: tCommon('labels.status'),
      key: ADMIN_BOOKING_COLUMN.STATUS,
      width: panelWidth(ADMIN_BOOKING_COLUMN.STATUS, 130),
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
      key: ADMIN_BOOKING_COLUMN.TOTAL,
      align: 'right',
      width: 130,
      hidden: withPanel,
      render: (_, r) => fmt.money(r.totalAmount),
    },
    {
      title: t('debtAmount'),
      key: ADMIN_BOOKING_COLUMN.DEBT,
      align: 'right',
      width: 120,
      hidden: withPanel,
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
    {
      ...actionColumn<AdminBooking>((row) => [
        {
          key: 'view',
          label: tCommon('actions.viewDetail'),
          icon: <EyeOutlined />,
          onClick: () => onView(row.id),
        },
      ]),
      hidden: withPanel,
    },
  ];

  return (
    <div ref={measureRef}>
      <DataTable<AdminBooking>
        label={t('label')}
        columns={columns}
        items={items}
        onRowClick={(row) => onView(row.id)}
        selectedRowKey={selectedId}
        minWidth={withPanel ? panelTableMinWidth(panelColumns) : FULL_TABLE_MIN_WIDTH}
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
    </div>
  );
}
