'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { useState } from 'react';
import {
  DRIVER_STATUS,
  DRIVER_STATUS_META,
  DRIVER_STATUS_VALUES,
  DRIVER_TYPE_LABEL,
  PERMISSION,
  type DriverStatus,
  type DriverType,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { dayjs } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { DRIVERS_DEFAULT_LIMIT } from '@/features/drivers/api';
import { DriverFormModal } from '@/features/drivers/components/DriverFormModal';
import { useDeleteDriver, useDrivers, useUpdateDriver } from '@/features/drivers/hooks/use-drivers';
import type { Driver, DriverFilters } from '@/features/drivers/types';
import styles from './drivers-page.module.css';

const FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm tài xế', placeholder: 'Tìm theo tên, SĐT, số GPLX' },
  {
    kind: 'select',
    key: 'status',
    label: 'Trạng thái',
    options: [
      { value: 'all', label: 'Tất cả trạng thái' },
      ...DRIVER_STATUS_VALUES.map((value) => ({
        value,
        label: DRIVER_STATUS_META[value].label,
      })),
    ],
    allowClear: false,
  },
];

const MIN_TABLE_WIDTH = 920;

/** Ngưỡng nhắc GPLX sắp hết hạn (ngày) — đủ thời gian đi gia hạn, không nhắc quá sớm. */
const LICENSE_WARN_DAYS = 30;

/**
 * Tag hạn GPLX: hết hạn (đỏ — không gán vào đơn mới được) · sắp hết hạn ≤30 ngày (vàng) ·
 * còn hạn dài thì chỉ hiện ngày. Chưa khai hạn thì không bịa tag.
 */
function LicenseExpiryTag({ licenseExpiresAt }: { licenseExpiresAt: string | null }) {
  if (!licenseExpiresAt) return null;
  const expiry = dayjs(licenseExpiresAt).endOf('day');
  const daysLeft = expiry.diff(dayjs(), 'day');
  if (daysLeft < 0) {
    return <Tag color="red">GPLX hết hạn {expiry.format('DD/MM/YYYY')}</Tag>;
  }
  if (daysLeft <= LICENSE_WARN_DAYS) {
    return <Tag color="orange">GPLX hết hạn {expiry.format('DD/MM/YYYY')}</Tag>;
  }
  return <span className={styles.meta}>GPLX đến {expiry.format('DD/MM/YYYY')}</span>;
}

/**
 * Hồ sơ tài xế của gian hàng (17/08 — nghiệp vụ xe có tài xế, mức tối thiểu: hồ sơ + gán vào
 * đơn ở màn chi tiết đơn thuê). Giấy tờ tài xế / lịch bận / chấm công: đợt sau.
 */
export default function DriversPage() {
  const { message } = App.useApp();
  const { has } = usePermissions();

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
            next === DRIVER_STATUS.ACTIVE ? 'Đã bật lại tài xế' : 'Đã ngừng hoạt động tài xế',
          ),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function handleRemove(row: Driver) {
    remove.mutate(row.id, {
      onSuccess: () => message.success('Đã xoá tài xế'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  const addButton = canManage ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      Thêm tài xế
    </Button>
  ) : null;

  const columns: DataTableColumn<Driver>[] = [
    {
      title: 'Tài xế',
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
      title: 'Loại',
      key: 'type',
      width: 140,
      render: (_, row) => (
        <Tag>{DRIVER_TYPE_LABEL[row.driverType as DriverType] ?? row.driverType}</Tag>
      ),
    },
    {
      title: 'GPLX / CCCD',
      key: 'papers',
      width: 240,
      render: (_, row) => (
        <div>
          <span className={styles.meta}>
            {[row.licenseNo, row.idNo].filter(Boolean).join(' · ') || '—'}
          </span>
          <LicenseExpiryTag licenseExpiresAt={row.licenseExpiresAt ?? null} />
        </div>
      ),
    },
    {
      title: 'Đơn đang gán',
      key: 'active',
      width: 130,
      render: (_, row) =>
        row.activeBookingCount > 0 ? <Tag color="blue">{row.activeBookingCount} đơn</Tag> : '—',
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 150,
      render: (_, row) => (
        <StatusTag value={row.status as DriverStatus} meta={DRIVER_STATUS_META} />
      ),
    },
    actionColumn<Driver>((row) => [
      {
        key: 'edit',
        label: 'Chỉnh sửa',
        icon: <EditOutlined />,
        hidden: !canManage,
        onClick: () => {
          setEditing(row);
          setFormOpen(true);
        },
      },
      {
        key: 'toggle',
        label: row.status === DRIVER_STATUS.ACTIVE ? 'Ngừng hoạt động' : 'Bật lại',
        hidden: !canManage,
        loading: update.isPending && update.variables?.id === row.id,
        confirm:
          row.status === DRIVER_STATUS.ACTIVE
            ? {
                title: 'Ngừng hoạt động tài xế này? Sẽ không gán được vào đơn mới.',
                okText: 'Ngừng',
                cancelText: 'Đóng',
              }
            : undefined,
        onClick: () => toggleStatus(row),
      },
      {
        key: 'remove',
        label: 'Xoá',
        icon: <DeleteOutlined />,
        danger: true,
        hidden: !canManage,
        loading: remove.isPending && remove.variables === row.id,
        confirm: {
          title: 'Xoá tài xế này? Đơn cũ vẫn giữ lịch sử; còn đơn chưa hoàn tất sẽ bị chặn.',
          okText: 'Xoá',
          cancelText: 'Đóng',
        },
        onClick: () => handleRemove(row),
      },
    ]),
  ];

  return (
    <div>
      <ManagePageHeader title="Tài xế" />

      <FilterBar
        fields={FILTER_FIELDS}
        values={{ q: filters.q, status: filters.status ?? 'all' }}
        onChange={(next) =>
          patch({ q: next.q, status: next.status === 'all' ? undefined : next.status })
        }
        actions={addButton}
      />

      <DataTable<Driver>
        label="Danh sách tài xế"
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data
            ? { title: 'Không tải được danh sách tài xế', onRetry: () => void refetch() }
            : null
        }
        empty={{
          title: 'Chưa có tài xế nào',
          description: 'Thêm tài xế để gán vào các đơn thuê xe có tài xế.',
          action: addButton ?? undefined,
        }}
        pagination={{
          meta,
          onChange: (page, pageSize) => patch({ page, limit: pageSize }),
          totalLabel: (total) => `${total} tài xế`,
        }}
      />

      <DriverFormModal open={formOpen} driver={editing} onClose={() => setFormOpen(false)} />
    </div>
  );
}
