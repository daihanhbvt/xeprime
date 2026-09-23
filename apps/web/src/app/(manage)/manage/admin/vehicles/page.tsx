'use client';

import { Segmented } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ADMIN_VEHICLES_DEFAULT_LIMIT } from '@/features/admin-vehicles/api';
import { ADMIN_VEHICLE_QUICK_FILTERS } from '@/features/admin-vehicles/constants';
import { AdminVehicleDetailDrawer } from '@/features/admin-vehicles/components/AdminVehicleDetailDrawer';
import { AdminVehicleTable } from '@/features/admin-vehicles/components/AdminVehicleTable';
import { useAdminVehicleFilters } from '@/features/admin-vehicles/hooks/use-admin-vehicle-filters';
import { useAdminVehicleOptions } from '@/features/admin-vehicles/hooks/use-admin-vehicle-options';
import { useAdminVehicles } from '@/features/admin-vehicles/hooks/use-admin-vehicles';
import type { AdminVehicleFilters } from '@/features/admin-vehicles/types';
import styles from './vehicles-page.module.css';

const CLEARED: Partial<AdminVehicleFilters> = {
  q: undefined,
  publicStatus: 'all',
  operationStatus: 'all',
  vehicleType: 'all',
  tenantStatus: 'all',
  marketplaceVisible: 'all',
  tenantId: undefined,
};

function PageFallback() {
  const t = useTranslations('AdminVehicles.page');
  return <LoadingState variant="page" label={t('loading')} />;
}

export default function AdminVehiclesPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <AdminVehiclesView />
    </Suspense>
  );
}

function AdminVehiclesView() {
  const t = useTranslations('AdminVehicles');
  const options = useAdminVehicleOptions();
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

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'publicStatus',
      label: t('filters.publicStatus'),
      options: options.publicStatus,
      allowClear: false,
    },
    {
      kind: 'select',
      key: 'operationStatus',
      label: t('filters.operationStatus'),
      options: options.operationStatus,
      allowClear: false,
    },
    {
      kind: 'select',
      key: 'vehicleType',
      label: t('filters.vehicleType'),
      options: options.vehicleType,
      allowClear: false,
    },
  ];

  const isSet = (value: string | undefined) => Boolean(value && value !== 'all');
  const hasFilters = Boolean(
    filters.q ||
      filters.tenantId ||
      isSet(filters.publicStatus) ||
      isSet(filters.operationStatus) ||
      isSet(filters.vehicleType) ||
      isSet(filters.tenantStatus) ||
      isSet(filters.marketplaceVisible),
  );

  /*
   * Lối tắt nào đang khớp CHÍNH XÁC bộ lọc hiện tại — không khớp thì không sáng cái nào.
   *
   * Cố ý KHÔNG đưa vào `FilterBar`: giá trị của nó SUY RA từ ba tham số chứ không phải một, và
   * chọn một lối tắt ghi một *patch* nhiều khoá. Đó là luật riêng của module giám sát xe — nhét
   * vào component chung sẽ làm nó biết nghiệp vụ.
   *
   * So khớp phải gồm CẢ `marketplaceVisible` (ADR 0048): thiếu nó thì lối tắt "Đang hiển thị"
   * và "Tất cả" trông giống hệt nhau, vì cả hai cùng để `publicStatus`/`tenantStatus` ở `all`.
   */
  const activeQuick =
    ADMIN_VEHICLE_QUICK_FILTERS.find(
      (f) =>
        f.patch.publicStatus === (filters.publicStatus ?? 'all') &&
        f.patch.tenantStatus === (filters.tenantStatus ?? 'all') &&
        f.patch.marketplaceVisible === (filters.marketplaceVisible ?? 'all'),
    )?.key ?? '';

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />

      {/*
        Cố ý KHÔNG truyền `onClear`: lối xoá lọc của trang này nằm trong màn "không có kết quả",
        đúng như trước khi migrate và giống ba module còn lại của đợt 1C-D. Nút "Xoá tất cả" luôn
        hiện là UI MỚI (Figma `127:2339` R5) — thuộc quyết định P24, chưa được chốt.
      */}
      <FilterBar
        fields={filterFields}
        values={filters as Record<string, string | undefined>}
        onChange={(patch) => setFilters(patch)}
      />

      <div className={styles.quickRow}>
        <Segmented
          aria-label={t('quick.ariaLabel')}
          value={activeQuick}
          options={options.quickFilters}
          onChange={(value) => {
            const hit = ADMIN_VEHICLE_QUICK_FILTERS.find((f) => f.key === value);
            setFilters(
              hit
                ? { ...hit.patch }
                : { publicStatus: 'all', tenantStatus: 'all', marketplaceVisible: 'all' },
            );
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
