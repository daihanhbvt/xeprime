'use client';

import { EyeOutlined, IdcardOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  DRIVER_ASSIGNMENT_STATUS,
  PLATFORM_TRIP_DRIVER_ISSUE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type PlatformTripDriverIssue,
  type TenantStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { adminPartnerPath } from '@/constants/routes';
import { AdminBookingDetailDrawer } from '@/features/admin-bookings/components/AdminBookingDetailDrawer';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { TRIPS_DEFAULT_LIMIT } from '../api';
import { useTripDrivers } from '../hooks/use-admin-trips';
import { useTripQueueFilters } from '../hooks/use-trip-queue-filters';
import type { TripDriver } from '../types';
import { HandoverDistance } from './TripDeadline';
import styles from './TripQueuePanels.module.css';

/** Năm cột, hai cột có chip mốc giờ — dưới ngưỡng này bảng cuộn ngang. */
const MIN_TABLE_WIDTH = 1080;

/**
 * Hàng đợi TÀI XẾ — đơn có tài xế kẹt khâu tài xế (ADR 0066 · 0067 · 0074): tài xế đã rút mà bên
 * thuê chưa điều phối lại, lượt gán quá hạn trả lời, hoặc sắp nhận xe mà chưa ai nhận chuyến.
 *
 * Người trực CHỈ xem và gọi: mở đơn, gọi chủ gian hàng (SĐT trên dòng), mở hồ sơ gian hàng để vào
 * phiên hỗ trợ. Không có nút gán tài xế — đó là việc của bên thuê (ADR 0063).
 *
 * Nhãn vấn đề, mốc và cờ khẩn do SERVER tính (một luật với số đếm trên thẻ); màn hình chỉ hiển thị.
 */
export function DriverQueuePanel() {
  const t = useTranslations('AdminTrips');
  const fmt = useAppFormat();
  const router = useRouter();
  const now = useNow();
  const { filters, setFilters } = useTripQueueFilters();
  const { open, ...listFilters } = filters;
  const { data, isError, isFetching, refetch } = useTripDrivers(listFilters);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: TRIPS_DEFAULT_LIMIT, total: 0, hasNext: false };

  // Mở/đóng panel chỉ đổi giao diện — không được đưa người dùng về trang 1.
  const openBooking = (id: string | undefined) => setFilters({ open: id }, { resetPage: false });

  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
  ];

  /** Vấn đề + mốc của nó. Tài xế đang được gán (chưa trả lời) thì nói tên người đang chờ. */
  const issue = (r: TripDriver) => {
    const kind = r.driverIssue as PlatformTripDriverIssue;
    const waiting =
      kind === PLATFORM_TRIP_DRIVER_ISSUE.UNASSIGNED &&
      r.driverAssignmentStatus === DRIVER_ASSIGNMENT_STATUS.PENDING;
    return (
      <div className={styles.stack}>
        <span>
          <Tag color={r.urgent ? 'error' : 'warning'}>
            {waiting ? t('driver.issue.awaiting') : t(`driver.issue.${kind}`)}
          </Tag>
        </span>
        {kind !== PLATFORM_TRIP_DRIVER_ISSUE.UNASSIGNED ? (
          <span className={styles.meta}>
            {t(`driver.deadline.${kind}`, { time: fmt.shortDateTime(r.deadlineAt) })}
          </span>
        ) : null}
        {kind !== PLATFORM_TRIP_DRIVER_ISSUE.UNASSIGNED ? (
          <HandoverDistance at={r.deadlineAt} now={now} />
        ) : null}
        {r.driverName ? (
          <span className={styles.meta}>{t('driver.assigned', { name: r.driverName })}</span>
        ) : null}
      </div>
    );
  };

  const columns: DataTableColumn<TripDriver>[] = [
    {
      title: t('booking.code'),
      key: 'code',
      width: 160,
      render: (_, r) => (
        <div className={styles.stack}>
          <button
            type="button"
            className={styles.codeButton}
            aria-label={t('booking.openDetail', { code: r.code })}
            onClick={() => openBooking(r.id)}
          >
            {r.code}
          </button>
          <span className={styles.meta}>{r.customerName}</span>
        </div>
      ),
    },
    {
      title: t('booking.vehicle'),
      key: 'vehicle',
      width: 250,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.primary}>
            {r.vehicleName}
            {r.vehiclePlateNumber ? `${LIST_SEPARATOR}${r.vehiclePlateNumber}` : ''}
          </span>
          <span className={styles.tenantName}>
            <span className={styles.meta}>
              {r.tenantName}
              {/* SĐT CHỦ GIAN HÀNG hiện đủ: gọi bên thuê là việc của chính hàng đợi này. */}
              {r.ownerPhone ? (
                <>
                  {LIST_SEPARATOR}
                  <a href={`tel:${r.ownerPhone}`} aria-label={t('request.callOwner')}>
                    {r.ownerPhone}
                  </a>
                </>
              ) : null}
            </span>
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag
                value={r.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
            ) : null}
          </span>
        </div>
      ),
    },
    {
      title: t('booking.pickup'),
      key: 'pickup',
      width: 170,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.period}>{fmt.shortDateTime(r.pickupAt)}</span>
          <HandoverDistance at={r.pickupAt} now={now} />
        </div>
      ),
    },
    { title: t('driver.issueColumn'), key: 'issue', width: 220, render: (_, r) => issue(r) },
    actionColumn<TripDriver>(
      (row) => [
        {
          key: 'detail',
          label: t('booking.detail'),
          icon: <EyeOutlined />,
          onClick: () => openBooking(row.id),
        },
        {
          key: 'partner',
          label: t('request.partnerProfile'),
          icon: <IdcardOutlined />,
          onClick: () => router.push(adminPartnerPath.resolveTenant(row.tenantId)),
        },
      ],
      { width: 160 },
    ),
  ];

  return (
    <div className={styles.panel}>
      <FilterBar
        compactFields
        fields={fields}
        values={{ q: filters.q }}
        onChange={(patch) => setFilters({ q: patch.q })}
      />
      <DataTable<TripDriver>
        label={t('driver.label')}
        columns={columns}
        items={items}
        onRowClick={(row) => openBooking(row.id)}
        selectedRowKey={open ?? null}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('booking.loadError'), onRetry: () => void refetch() } : null
        }
        filtered={Boolean(filters.q)}
        empty={{ title: t('empty.driver') }}
        noResults={{ title: t('booking.noResults') }}
        pagination={{
          meta,
          onChange: (page, pageSize) => setFilters({ page, limit: pageSize }),
          totalLabel: (total) => t('booking.total', { count: total }),
        }}
        renderCard={(row) => (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.stack}>
                <span className={styles.primary}>{row.code}</span>
                <span className={styles.meta}>{row.customerName}</span>
              </div>
              <HandoverDistance at={row.pickupAt} now={now} />
            </div>
            <div className={styles.cardLine}>
              {row.vehicleName}
              {row.vehiclePlateNumber ? `${LIST_SEPARATOR}${row.vehiclePlateNumber}` : ''}
            </div>
            <div className={styles.meta}>
              {row.tenantName}
              {row.ownerPhone ? (
                <>
                  {LIST_SEPARATOR}
                  <a href={`tel:${row.ownerPhone}`} aria-label={t('request.callOwner')}>
                    {row.ownerPhone}
                  </a>
                </>
              ) : null}
            </div>
            {issue(row)}
          </article>
        )}
      />

      <AdminBookingDetailDrawer bookingId={open ?? null} onClose={() => openBooking(undefined)} />
    </div>
  );
}
