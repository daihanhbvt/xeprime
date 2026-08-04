'use client';

import { Button, Empty, Input, Result, Segmented, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ADMIN_VEHICLES_DEFAULT_LIMIT } from '@/features/admin-vehicles/api';
import {
  ADMIN_VEHICLE_OPERATION_STATUS_OPTIONS,
  ADMIN_VEHICLE_PUBLIC_STATUS_OPTIONS,
  ADMIN_VEHICLE_QUICK_FILTERS,
  ADMIN_VEHICLE_TYPE_OPTIONS,
} from '@/features/admin-vehicles/constants';
import { AdminVehicleDetailDrawer } from '@/features/admin-vehicles/components/AdminVehicleDetailDrawer';
import { AdminVehicleTable } from '@/features/admin-vehicles/components/AdminVehicleTable';
import { useAdminVehicleFilters } from '@/features/admin-vehicles/hooks/use-admin-vehicle-filters';
import { useAdminVehicles } from '@/features/admin-vehicles/hooks/use-admin-vehicles';
import type { AdminVehicleFilters } from '@/features/admin-vehicles/types';
import styles from './vehicles-page.module.css';

const CLEARED: Partial<AdminVehicleFilters> = {
  q: undefined,
  publicStatus: 'all',
  operationStatus: 'all',
  vehicleType: 'all',
  tenantStatus: 'all',
  tenantId: undefined,
};

export default function AdminVehiclesPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminVehiclesView />
    </Suspense>
  );
}

function AdminVehiclesView() {
  const { filters, setFilters } = useAdminVehicleFilters();
  const { data, isError, refetch, isFetching } = useAdminVehicles(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_VEHICLES_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };

  const isSet = (value: string | undefined) => Boolean(value && value !== 'all');
  const hasFilters = Boolean(
    filters.q ||
      filters.tenantId ||
      isSet(filters.publicStatus) ||
      isSet(filters.operationStatus) ||
      isSet(filters.vehicleType) ||
      isSet(filters.tenantStatus),
  );

  // Lối tắt nào đang khớp chính xác bộ lọc hiện tại — không khớp thì không sáng cái nào.
  const activeQuick =
    ADMIN_VEHICLE_QUICK_FILTERS.find(
      (f) =>
        (f.patch.publicStatus ?? 'all') === (filters.publicStatus ?? 'all') &&
        (f.patch.tenantStatus ?? 'all') === (filters.tenantStatus ?? 'all'),
    )?.key ?? '';

  return (
    <div>
      <ManagePageHeader
        title="Xe toàn hệ thống"
        extra={
          <Space wrap>
            <Input.Search
              className={styles.search}
              size="large"
              allowClear
              placeholder="Tìm tên xe / biển số / mã"
              defaultValue={filters.q}
              onSearch={(value) => setFilters({ q: value.trim() || undefined })}
            />
            <Select
              className={styles.select}
              size="large"
              value={filters.publicStatus ?? 'all'}
              options={ADMIN_VEHICLE_PUBLIC_STATUS_OPTIONS}
              onChange={(value: string) => setFilters({ publicStatus: value })}
            />
            <Select
              className={styles.select}
              size="large"
              value={filters.operationStatus ?? 'all'}
              options={ADMIN_VEHICLE_OPERATION_STATUS_OPTIONS}
              onChange={(value: string) => setFilters({ operationStatus: value })}
            />
            <Select
              className={styles.typeSelect}
              size="large"
              value={filters.vehicleType ?? 'all'}
              options={ADMIN_VEHICLE_TYPE_OPTIONS}
              onChange={(value: string) => setFilters({ vehicleType: value })}
            />
          </Space>
        }
      />

      <div className={styles.quickRow}>
        <Segmented
          value={activeQuick}
          options={[
            { value: '', label: 'Tất cả' },
            ...ADMIN_VEHICLE_QUICK_FILTERS.map((f) => ({ value: f.key, label: f.label })),
          ]}
          onChange={(value) => {
            const hit = ADMIN_VEHICLE_QUICK_FILTERS.find((f) => f.key === value);
            setFilters(hit ? hit.patch : { publicStatus: 'all', tenantStatus: 'all' });
          }}
        />
      </div>

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách xe"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty
          className={styles.state}
          description={hasFilters ? 'Không có xe khớp bộ lọc' : 'Chưa có xe nào trong hệ thống'}
        >
          {hasFilters ? <Button onClick={() => setFilters(CLEARED)}>Xoá bộ lọc</Button> : null}
        </Empty>
      ) : (
        <AdminVehicleTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setSelected(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <AdminVehicleDetailDrawer vehicleId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
