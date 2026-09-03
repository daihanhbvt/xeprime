'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_STATUS,
  DRIVER_STATUS_META,
  DRIVER_STATUS_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  type DriverStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FeatureWriteTooltip } from '@/components/feedback/FeatureWriteTooltip';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { nowInAppTz, startOfAppDay } from '@/lib/datetime';
import { DRIVERS_DEFAULT_LIMIT } from '@/features/drivers/api';
import { DriverFormModal } from '@/features/drivers/components/DriverFormModal';
import { useDeleteDriver, useDrivers, useUpdateDriver } from '@/features/drivers/hooks/use-drivers';
import type { Driver, DriverFilters } from '@/features/drivers/types';
import styles from './drivers-page.module.css';

const MIN_TABLE_WIDTH = 920;

/** Ngưỡng nhắc GPLX sắp hết hạn (ngày) — đủ thời gian đi gia hạn, không nhắc quá sớm. */
const LICENSE_WARN_DAYS = 30;

/**
 * Tag hạn GPLX: hết hạn (đỏ — không gán vào đơn mới được) · sắp hết hạn ≤30 ngày (vàng) ·
 * còn hạn dài thì chỉ hiện ngày. Chưa khai hạn thì không bịa tag.
 */
function LicenseExpiryTag({ licenseExpiresAt }: { licenseExpiresAt: string | null }) {
  const t = useTranslations('Drivers');
  const fmt = useAppFormat();
  if (!licenseExpiresAt) return null;

  /*
   * `licenseExpiresAt` là NGÀY LỊCH `YYYY-MM-DD` (cột `@db.Date`, API trả qua `fromDateOnly`),
   * không phải mốc thời gian. Đưa nó qua `dayjs(value)` là mượn nửa đêm THEO MÁY rồi in lại
   * theo giờ VN — trên máy đặt ở UTC, hạn 03/09 hiện thành 04/09.
   *
   * Ranh giới "hết hạn" thì phải là mốc thật để đếm ngày còn lại: hết ngày đó theo giờ VN.
   */
  const expiry = startOfAppDay(licenseExpiresAt).endOf('day');
  const daysLeft = expiry.diff(nowInAppTz(), 'day');
  // Ngày qua `useAppFormat` — định dạng theo ngôn ngữ, không format cứng ở call site.
  const date = fmt.dateKey(licenseExpiresAt);

  if (daysLeft < 0) return <Tag color="red">{t('license.expired', { date })}</Tag>;
  if (daysLeft <= LICENSE_WARN_DAYS)
    return <Tag color="orange">{t('license.expired', { date })}</Tag>;
  return <span className={styles.meta}>{t('license.validUntil', { date })}</span>;
}

/**
 * Hồ sơ tài xế của gian hàng (17/08 — nghiệp vụ xe có tài xế, mức tối thiểu: hồ sơ + gán vào
 * đơn ở màn chi tiết đơn thuê). Giấy tờ tài xế / lịch bận / chấm công: đợt sau.
 */
export default function DriversPage() {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  // Bộ lọc là state cục bộ — cùng hình thái các trang danh sách manage khác (members).
  const [filters, setFilters] = useState<DriverFilters>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);

  const { data, isError, refetch, isFetching } = useDrivers(filters);
  const update = useUpdateDriver();
  const remove = useDeleteDriver();

  const canManage = has(PERMISSION.DRIVER_MANAGE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: DRIVERS_DEFAULT_LIMIT, total: 0, hasNext: false };

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      options: [
        { value: 'all', label: t('filters.allStatuses') },
        ...DRIVER_STATUS_VALUES.map((value) => ({
          value,
          label: domainLabel('driverStatus', value),
        })),
      ],
      allowClear: false,
    },
  ];

  function patch(next: Partial<DriverFilters>) {
    setFilters((prev) => ({ ...prev, ...next, ...('page' in next ? {} : { page: 1 }) }));
  }

  function toggleStatus(row: Driver) {
    const next =
      row.status === DRIVER_STATUS.ACTIVE ? DRIVER_STATUS.INACTIVE : DRIVER_STATUS.ACTIVE;
    update.mutate(
      { id: row.id, body: { status: next } },
      {
        onSuccess: () =>
          message.success(
            next === DRIVER_STATUS.ACTIVE ? t('toast.activated') : t('toast.deactivated'),
          ),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function handleRemove(row: Driver) {
    remove.mutate(row.id, {
      onSuccess: () => message.success(t('toast.removed')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  // Tài xế là tính năng của GÓI (ADR 0027): hết hạn thì xem lại hồ sơ được, không thêm được
  // người mới. Lớp chặn thật là `PlanFeatureGuard` ở backend.
  const addButton = canManage ? (
    <FeatureWriteTooltip feature={PLAN_FEATURE.DRIVERS}>
      {(disabled) => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('actions.add')}
        </Button>
      )}
    </FeatureWriteTooltip>
  ) : null;

  const columns: DataTableColumn<Driver>[] = [
    {
      title: t('columns.driver'),
      key: 'driver',
      width: 240,
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.name}</div>
          <div className={styles.meta}>{row.phone}</div>
        </div>
      ),
    },
    {
      title: t('columns.type'),
      key: 'type',
      width: 140,
      render: (_, row) => <Tag>{domainLabel('driverType', row.driverType, row.driverType)}</Tag>,
    },
    {
      title: t('columns.papers'),
      key: 'papers',
      width: 240,
      render: (_, row) => (
        <div>
          <span className={styles.meta}>
            {[row.licenseNo, row.idNo].filter(Boolean).join(' · ') || tCommon('labels.emptyValue')}
          </span>
          <LicenseExpiryTag licenseExpiresAt={row.licenseExpiresAt ?? null} />
        </div>
      ),
    },
    {
      title: t('columns.activeBookings'),
      key: 'active',
      width: 130,
      render: (_, row) =>
        row.activeBookingCount > 0 ? (
          <Tag color="blue">{t('activeBookings', { count: row.activeBookingCount })}</Tag>
        ) : (
          tCommon('labels.emptyValue')
        ),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag
          value={row.status as DriverStatus}
          meta={DRIVER_STATUS_META}
          group="driverStatus"
        />
      ),
    },
    actionColumn<Driver>((row) => [
      {
        key: 'edit',
        label: tCommon('actions.edit'),
        icon: <EditOutlined />,
        hidden: !canManage,
        onClick: () => {
          setEditing(row);
          setFormOpen(true);
        },
      },
      {
        key: 'toggle',
        label:
          row.status === DRIVER_STATUS.ACTIVE ? t('actions.deactivate') : t('actions.activate'),
        hidden: !canManage,
        loading: update.isPending && update.variables?.id === row.id,
        confirm:
          row.status === DRIVER_STATUS.ACTIVE
            ? {
                title: t('actions.deactivateConfirm'),
                okText: t('actions.deactivateOk'),
                cancelText: tCommon('actions.close'),
              }
            : undefined,
        onClick: () => toggleStatus(row),
      },
      {
        key: 'remove',
        label: tCommon('actions.delete'),
        icon: <DeleteOutlined />,
        danger: true,
        hidden: !canManage,
        loading: remove.isPending && remove.variables === row.id,
        confirm: {
          title: t('actions.removeConfirm'),
          okText: tCommon('actions.delete'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => handleRemove(row),
      },
    ]),
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, status: filters.status ?? 'all' }}
        onChange={(next) =>
          patch({ q: next.q, status: next.status === 'all' ? undefined : next.status })
        }
        actions={addButton}
      />

      <DataTable<Driver>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{
          title: t('page.empty'),
          description: t('page.emptyHint'),
          action: addButton ?? undefined,
        }}
        pagination={{
          meta,
          onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

      <DriverFormModal open={formOpen} driver={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
