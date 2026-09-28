'use client';

import { LockOutlined } from '@ant-design/icons';
import { Button, Progress, Tag, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  BOOKING_STATUS_META,
  PARTNER_QUOTA_KIND,
  QUOTA_LIMIT_REASON,
  VEHICLE_ALERT_SEVERITY,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type BookingStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isForbiddenError } from '@/lib/http-status';
import type { PartnerBooking, PartnerQuotaItem, PartnerVehicle } from './api';
import styles from './PartnerDetail.module.css';

/** Trạng thái chung của một tab: tải / không quyền / lỗi. `null` = đã có dữ liệu, render tiếp. */
export function useTabState({
  isLoading,
  error,
  onRetry,
  deniedMessage,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  deniedMessage: string;
}): ReactNode {
  const t = useTranslations('AdminTenants.partnerDetail');
  if (error) {
    if (isForbiddenError(error)) {
      return (
        <PermissionState kind="forbidden" title={t('denied.title')} description={deniedMessage} />
      );
    }
    return (
      <EmptyState
        variant="error"
        title={t('states.loadError')}
        description={t('states.loadErrorBody')}
        onRetry={onRetry}
      />
    );
  }
  if (isLoading) return <LoadingState variant="cards" label={t('states.loading')} />;
  return null;
}

/** Bảng khoá–giá trị gọn cho các khối thông tin. */
export function KeyValues({
  items,
}: {
  items: { key: string; label: string; value: ReactNode }[];
}) {
  return (
    <dl className={styles.kv}>
      {items.map((item) => (
        <div key={item.key} className={styles.kvRow}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Một số tiền — hoặc dấu che khi server đã BỎ giá trị vì người xem thiếu quyền tiền. Không có
 * nhánh "có giá trị nhưng che": tiền không bao giờ tới client nếu người xem không được thấy.
 */
export function MoneyValue({ value }: { value: string | null | undefined }) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const fmt = useAppFormat();
  if (value == null) {
    return (
      <Tooltip title={t('money.hiddenHint')}>
        <span className={styles.muted} aria-label={t('money.hiddenHint')}>
          <LockOutlined /> {t('money.hidden')}
        </span>
      </Tooltip>
    );
  }
  return <>{fmt.money(value)}</>;
}

/**
 * Một hạn mức — BA trạng thái do server quyết (`PARTNER_QUOTA_KIND`), không bao giờ suy từ
 * `limit = null`: "không giới hạn" và "không áp dụng" là hai câu khác nhau, và một trần Owner Lite
 * phải nói rõ là Owner Lite chứ không trông như trần của gói.
 */
export function QuotaValue({
  quota,
  unit,
}: {
  quota: PartnerQuotaItem;
  /** Đơn vị đếm (`vehicles`) — chỉ để câu "x / y xe" đọc tự nhiên. */
  unit?: 'vehicles';
}) {
  const t = useTranslations('AdminTenants.partnerDetail.quota');
  if (quota.kind === PARTNER_QUOTA_KIND.NOT_APPLICABLE) {
    return <span className={styles.muted}>{t('notApplicable', { used: quota.used })}</span>;
  }
  if (quota.kind !== PARTNER_QUOTA_KIND.TOTAL || quota.limit == null) {
    return <span>{t('unlimited', { used: quota.used })}</span>;
  }
  const percent =
    quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 100;
  return (
    <span className={styles.progress}>
      <span>
        {unit === 'vehicles'
          ? t('usedOfVehicles', { used: quota.used, limit: quota.limit })
          : t('usedOf', { used: quota.used, limit: quota.limit })}
        {quota.reason === QUOTA_LIMIT_REASON.OWNER_LITE ? (
          <span className={styles.muted}> · {t('ownerLite')}</span>
        ) : quota.reason === QUOTA_LIMIT_REASON.BILLING_UNCONFIGURED ? (
          <span className={styles.warning}> · {t('unconfigured')}</span>
        ) : null}
      </span>
      <Progress
        percent={percent}
        showInfo={false}
        size="small"
        status={quota.used >= quota.limit ? 'exception' : 'normal'}
      />
    </span>
  );
}

/** `YYYY-MM` (tháng lịch VN, từ server) → "Tháng 8, 2025" / "August 2025" theo ngôn ngữ đang dùng. */
export function usePeriodLabel(): (period: string) => string {
  const fmt = useAppFormat();
  // Giữa tháng theo giờ VN: không lệch sang tháng bên cạnh dù đọc ở múi giờ nào.
  return (period) => fmt.monthYear(new Date(`${period}-15T00:00:00+07:00`));
}

/** Nhãn cảnh báo của xe — loại việc, không chi tiết (server đã bỏ câu chữ và link). */
export function AlertTags({ alerts, max = 2 }: { alerts: PartnerVehicle['alerts']; max?: number }) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const domainLabel = useDomainLabel();
  if (alerts.length === 0) return <span className={styles.muted}>{t('states.none')}</span>;
  return (
    <span className={styles.alertCell}>
      {alerts.slice(0, max).map((alert) => (
        <Tag
          key={alert.kind}
          color={alert.severity === VEHICLE_ALERT_SEVERITY.CRITICAL ? 'error' : 'warning'}
        >
          {domainLabel('vehicleAlertShort', alert.kind)}
        </Tag>
      ))}
      {alerts.length > max ? (
        <Tag>{t('vehicles.moreAlerts', { count: alerts.length - max })}</Tag>
      ) : null}
    </span>
  );
}

/** Ô "xe" dùng chung cho mọi bảng của drawer: ảnh + tên + biển số. */
export function VehicleCell({
  name,
  plate,
  imageUrl,
}: {
  name: string;
  plate: string | null | undefined;
  imageUrl: string | null | undefined;
}) {
  return (
    <EntityIdentity
      kind="vehicle"
      name={name}
      subtitle={plate ?? undefined}
      imageUrl={imageUrl ?? undefined}
      size="sm"
    />
  );
}

/**
 * Bảng xe dùng chung — tab Xe và khối "Xe gần đây". Gian hàng gói có cột Chi nhánh; chủ xe cá
 * nhân thay bằng Khu vực nhận xe (không có khái niệm chi nhánh với họ).
 */
export function PartnerVehicleTable({
  items,
  isPackage,
  compact = false,
  pagination,
  loading,
  filtered,
  onClearFilters,
}: {
  items: PartnerVehicle[];
  isPackage: boolean;
  compact?: boolean;
  pagination?: { page: number; total: number; pageSize: number; onChange: (page: number) => void };
  loading?: boolean;
  filtered?: boolean;
  onClearFilters?: () => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.vehicles');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const columns: DataTableColumn<PartnerVehicle>[] = [
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      width: 240,
      render: (_, row) => (
        <VehicleCell
          name={row.name}
          plate={row.plateNumber ?? row.code}
          imageUrl={row.mainImageUrl}
        />
      ),
    },
    isPackage
      ? {
          title: t('columns.branch'),
          key: 'branch',
          width: 140,
          render: (_, row) => row.branchName ?? '—',
        }
      : {
          title: t('columns.pickupArea'),
          key: 'pickupArea',
          width: 160,
          render: (_, row) => row.pickupAreaName ?? '—',
        },
    ...(compact
      ? []
      : [
          {
            title: t('columns.service'),
            key: 'service',
            width: 140,
            render: (_: unknown, row: PartnerVehicle) => fmt.serviceTypes(row.serviceTypes),
          } satisfies DataTableColumn<PartnerVehicle>,
        ]),
    {
      title: t('columns.operation'),
      key: 'operation',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
          group="vehicleOperationStatus"
        />
      ),
    },
    {
      title: t('columns.marketplace'),
      key: 'marketplace',
      width: 150,
      render: (_, row) => (
        <span className={styles.stack}>
          <StatusTag
            value={row.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
          {row.isMarketplaceVisible ? null : (
            <span className={cx(styles.muted, styles.small)}>{t('notVisible')}</span>
          )}
        </span>
      ),
    },
    ...(compact
      ? []
      : [
          {
            title: t('columns.alerts'),
            key: 'alerts',
            width: 200,
            render: (_: unknown, row: PartnerVehicle) => <AlertTags alerts={row.alerts} />,
          } satisfies DataTableColumn<PartnerVehicle>,
          {
            title: t('columns.updated'),
            key: 'updated',
            width: 130,
            render: (_: unknown, row: PartnerVehicle) => fmt.dateTime(row.updatedAt),
          } satisfies DataTableColumn<PartnerVehicle>,
        ]),
  ];

  return (
    <DataTable<PartnerVehicle>
      label={t('tableLabel')}
      columns={columns}
      items={items}
      minWidth={compact ? 640 : 1080}
      loading={loading}
      filtered={filtered}
      empty={{ title: t('empty') }}
      noResults={{
        title: t('noResults'),
        action: onClearFilters ? (
          <Button type="link" onClick={onClearFilters}>
            {t('clearFilters')}
          </Button>
        ) : undefined,
      }}
      pagination={
        pagination
          ? {
              meta: {
                page: pagination.page,
                limit: pagination.pageSize,
                total: pagination.total,
                hasNext: pagination.page * pagination.pageSize < pagination.total,
              },
              onChange: (page) => pagination.onChange(page),
              totalLabel: (total) => t('total', { count: total }),
            }
          : undefined
      }
      renderCard={(row) => (
        <div className={styles.stack}>
          <VehicleCell
            name={row.name}
            plate={row.plateNumber ?? row.code}
            imageUrl={row.mainImageUrl}
          />
          <span className={styles.small}>
            {domainLabel('vehicleOperationStatus', row.operationStatus)} ·{' '}
            {domainLabel('vehiclePublicStatus', row.publicStatus)}
          </span>
          <AlertTags alerts={row.alerts} />
        </div>
      )}
    />
  );
}

/** Bảng đơn thuê dùng chung — tab Đơn thuê và khối "Đơn thuê gần đây". Không có cột hành động. */
export function PartnerBookingTable({
  items,
  compact = false,
  pagination,
  loading,
  filtered,
  onClearFilters,
}: {
  items: PartnerBooking[];
  compact?: boolean;
  pagination?: { page: number; total: number; pageSize: number; onChange: (page: number) => void };
  loading?: boolean;
  filtered?: boolean;
  onClearFilters?: () => void;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.bookings');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const columns: DataTableColumn<PartnerBooking>[] = [
    { title: t('columns.code'), key: 'code', width: 120, render: (_, row) => row.code },
    ...(compact
      ? []
      : [
          {
            title: t('columns.vehicle'),
            key: 'vehicle',
            width: 220,
            render: (_: unknown, row: PartnerBooking) => (
              <VehicleCell
                name={row.vehicleName}
                plate={row.vehiclePlateNumber}
                imageUrl={row.vehicleImageUrl}
              />
            ),
          } satisfies DataTableColumn<PartnerBooking>,
        ]),
    ...(compact
      ? [
          {
            title: t('columns.vehicle'),
            key: 'vehicleName',
            width: 160,
            render: (_: unknown, row: PartnerBooking) => row.vehicleName,
          } satisfies DataTableColumn<PartnerBooking>,
        ]
      : []),
    {
      title: t('columns.customer'),
      key: 'customer',
      width: 170,
      render: (_, row) => (
        <span className={styles.stack}>
          <span>{row.customerNameMasked}</span>
          {row.customerPhoneMasked ? (
            <span className={styles.muted}>{row.customerPhoneMasked}</span>
          ) : null}
        </span>
      ),
    },
    {
      title: t('columns.time'),
      key: 'time',
      width: 190,
      render: (_, row) => fmt.shortDateTimeRange(row.pickupAt, row.returnAt),
    },
    ...(compact
      ? []
      : [
          {
            title: t('columns.service'),
            key: 'service',
            width: 110,
            render: (_: unknown, row: PartnerBooking) =>
              domainLabel('serviceType', row.serviceType),
          } satisfies DataTableColumn<PartnerBooking>,
        ]),
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.status as BookingStatus}
          meta={BOOKING_STATUS_META}
          group="bookingStatus"
        />
      ),
    },
    ...(compact
      ? []
      : [
          {
            title: t('columns.total'),
            key: 'total',
            width: 130,
            align: 'right',
            render: (_: unknown, row: PartnerBooking) => <MoneyValue value={row.totalAmount} />,
          } satisfies DataTableColumn<PartnerBooking>,
        ]),
  ];

  return (
    <DataTable<PartnerBooking>
      label={t('tableLabel')}
      columns={columns}
      items={items}
      minWidth={compact ? 640 : 1080}
      loading={loading}
      filtered={filtered}
      empty={{ title: t('empty') }}
      noResults={{
        title: t('noResults'),
        action: onClearFilters ? (
          <Button type="link" onClick={onClearFilters}>
            {t('clearFilters')}
          </Button>
        ) : undefined,
      }}
      pagination={
        pagination
          ? {
              meta: {
                page: pagination.page,
                limit: pagination.pageSize,
                total: pagination.total,
                hasNext: pagination.page * pagination.pageSize < pagination.total,
              },
              onChange: (page) => pagination.onChange(page),
              totalLabel: (total) => t('total', { count: total }),
            }
          : undefined
      }
      renderCard={(row) => (
        <div className={styles.stack}>
          <strong>{row.code}</strong>
          <span>{row.vehicleName}</span>
          <span className={styles.small}>{fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}</span>
          <StatusTag
            value={row.status as BookingStatus}
            meta={BOOKING_STATUS_META}
            group="bookingStatus"
          />
        </div>
      )}
    />
  );
}
