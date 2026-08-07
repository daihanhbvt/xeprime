'use client';

import { Segmented } from 'antd';
import { Suspense, useState } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
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

const FILTER_FIELDS: FilterField[] = [
  { kind: 'search', key: 'q', label: 'Tìm xe', placeholder: 'Tìm tên xe / biển số / mã' },
  {
    kind: 'select',
    key: 'publicStatus',
    label: 'Duyệt public',
    options: ADMIN_VEHICLE_PUBLIC_STATUS_OPTIONS,
    allowClear: false,
  },
  {
    kind: 'select',
    key: 'operationStatus',
    label: 'Vận hành',
    options: ADMIN_VEHICLE_OPERATION_STATUS_OPTIONS,
    allowClear: false,
  },
  {
    kind: 'select',
    key: 'vehicleType',
    label: 'Loại xe',
    options: ADMIN_VEHICLE_TYPE_OPTIONS,
    allowClear: false,
  },
];

export default function AdminVehiclesPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" label="Đang tải xe toàn hệ thống…" />}>
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
  //
  // Cố ý KHÔNG đưa vào `FilterBar`: giá trị của nó SUY RA từ hai tham số (`publicStatus` +
  // `tenantStatus`) chứ không phải một tham số, và chọn một lối tắt ghi một *patch* nhiều khoá.
  // Đó là luật riêng của module giám sát xe — nhét vào component chung sẽ làm nó biết nghiệp vụ.
  const activeQuick =
    ADMIN_VEHICLE_QUICK_FILTERS.find(
      (f) =>
        (f.patch.publicStatus ?? 'all') === (filters.publicStatus ?? 'all') &&
        (f.patch.tenantStatus ?? 'all') === (filters.tenantStatus ?? 'all'),
    )?.key ?? '';

  return (
    <div>
      <ManagePageHeader title="Xe toàn hệ thống" />

      {/*
        Cố ý KHÔNG truyền `onClear`: lối xoá lọc của trang này nằm trong màn "không có kết quả",
        đúng như trước khi migrate và giống ba module còn lại của đợt 1C-D. Nút "Xoá tất cả" luôn
        hiện là UI MỚI (Figma `127:2339` R5) — thuộc quyết định P24, chưa được chốt.
      */}
      <FilterBar
        fields={FILTER_FIELDS}
        values={filters as Record<string, string | undefined>}
        onChange={(patch) => setFilters(patch)}
      />

      <div className={styles.quickRow}>
        <Segmented
          aria-label="Lối tắt lọc xe"
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

      <AdminVehicleTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => setSelected(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      <AdminVehicleDetailDrawer vehicleId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
