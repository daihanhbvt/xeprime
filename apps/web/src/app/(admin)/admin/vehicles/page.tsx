'use client';

import { CloseOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { DEFAULT_PLATFORM_VEHICLE_SORT, PLATFORM_VEHICLE_SORT } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { CountTabs } from '@/components/navigation/CountTabs';
import { ALL_FILTER } from '@/constants/filters';
import { ADMIN_VEHICLES_DEFAULT_LIMIT } from '@/features/admin-vehicles/api';
import {
  ADMIN_VEHICLE_VIEWS,
  activeAdminVehicleView,
  adminVehicleViewPatch,
} from '@/features/admin-vehicles/constants';
import { AdminVehicleDetailDrawer } from '@/features/admin-vehicles/components/AdminVehicleDetailDrawer';
import { AdminVehicleTable } from '@/features/admin-vehicles/components/AdminVehicleTable';
import {
  filterBarPatch,
  useAdminVehicleFilters,
} from '@/features/admin-vehicles/hooks/use-admin-vehicle-filters';
import { useAdminVehicleOptions } from '@/features/admin-vehicles/hooks/use-admin-vehicle-options';
import { useAdminVehicles } from '@/features/admin-vehicles/hooks/use-admin-vehicles';
import type { AdminVehicleUrlState } from '@/features/admin-vehicles/types';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import styles from './vehicles-page.module.css';

/** "Xoá bộ lọc" chỉ đụng bộ lọc — giữ nguyên cách sắp xếp và xe đang mở. */
const CLEARED: Partial<AdminVehicleUrlState> = {
  q: undefined,
  tenantId: undefined,
  publicStatus: ALL_FILTER,
  operationStatus: ALL_FILTER,
  vehicleType: ALL_FILTER,
  serviceType: ALL_FILTER,
  provinceCode: ALL_FILTER,
  tenantStatus: ALL_FILTER,
  marketplaceVisible: ALL_FILTER,
};

/** Bốn ô lọc đứng trên hàng; hai ô trạng thái (đã có tab góc nhìn lo phần hay dùng) dồn vào popover. */
const INLINE_FIELD_LIMIT = 4;

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

/**
 * "XE TOÀN HỆ THỐNG" — giám sát mọi xe của gian hàng và chủ xe cá nhân trên nền tảng.
 *
 * Mọi bộ lọc, sắp xếp, trang và xe đang mở sống ở URL (ADR 0004) — tải lại, Back, và link gửi cho
 * đồng nghiệp đều rơi đúng chỗ. Lọc, đếm, sắp xếp và phân trang chạy ở SERVER; số trên tab góc
 * nhìn đến từ cùng lần đọc với danh sách.
 */
function AdminVehiclesView() {
  const t = useTranslations('AdminVehicles');
  const options = useAdminVehicleOptions();
  const provinces = useProvinceOptions();
  const { filters, setFilters } = useAdminVehicleFilters();
  const { open: openId, ...listFilters } = filters;
  const { data, isError, refetch, isFetching } = useAdminVehicles(listFilters);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: ADMIN_VEHICLES_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const counts = data?.counts;

  const all = { value: ALL_FILTER, label: t('filters.all') };
  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.searchLabel'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'vehicleType',
      label: t('filters.vehicleType'),
      options: options.vehicleType,
      allowClear: false,
    },
    {
      kind: 'select',
      key: 'serviceType',
      label: t('filters.serviceType'),
      options: options.serviceType,
      allowClear: false,
    },
    {
      kind: 'select',
      key: 'provinceCode',
      label: t('filters.province'),
      options: [all, ...provinces.options],
      allowClear: false,
      searchable: true,
    },
    {
      kind: 'select',
      key: 'sort',
      label: t('filters.sort'),
      options: options.sort,
      allowClear: false,
      defaultValue: DEFAULT_PLATFORM_VEHICLE_SORT,
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
  ];

  const isSet = (value: string | undefined) => Boolean(value && value !== ALL_FILTER);
  const hasFilters = Boolean(
    filters.q ||
      filters.tenantId ||
      isSet(filters.publicStatus) ||
      isSet(filters.operationStatus) ||
      isSet(filters.vehicleType) ||
      isSet(filters.serviceType) ||
      isSet(filters.provinceCode) ||
      isSet(filters.tenantStatus) ||
      isSet(filters.marketplaceVisible),
  );

  const activeView = activeAdminVehicleView(filters);

  // Mở/đóng panel chỉ đổi giao diện — không được đưa người dùng về trang 1.
  const pager = useOpenRecordPager(
    items.map((row) => row.id),
    openId,
  );
  const openVehicle = (id: string | undefined) => {
    if (id) pager.remember();
    setFilters({ open: id }, { resetPage: false });
  };

  /*
   * Lọc theo gian hàng chỉ đến từ link (trang đối tác, đơn thuê) — không có ô nào trên thanh lọc,
   * nên phải có một chip nói ra điều đó, gỡ được. Tên gian hàng lấy từ chính dòng dữ liệu (mọi
   * dòng cùng một gian hàng); chưa có dòng nào thì nói chung chung thay vì đoán.
   */
  const tenantChipLabel = filters.tenantId
    ? items[0]?.tenantName
      ? t('filters.tenantChip', { name: items[0].tenantName })
      : t('filters.tenantChipUnknown')
    : null;

  return (
    <div>
      <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      <CountTabs
        label={t('views.ariaLabel')}
        value={activeView}
        items={ADMIN_VEHICLE_VIEWS.map((view) => ({
          value: view.key,
          label: t(`views.${view.key}`),
          count: counts?.[view.key],
        }))}
        onChange={(key) => setFilters(adminVehicleViewPatch(key))}
      />

      <FilterBar
        compactFields
        inlineFieldLimit={INLINE_FIELD_LIMIT}
        fields={fields}
        values={{
          q: filters.q,
          vehicleType: filters.vehicleType,
          serviceType: filters.serviceType,
          provinceCode: filters.provinceCode,
          sort: filters.sort ?? DEFAULT_PLATFORM_VEHICLE_SORT,
          publicStatus: filters.publicStatus,
          operationStatus: filters.operationStatus,
        }}
        onChange={(patch) => setFilters(filterBarPatch(patch))}
        onClear={hasFilters ? () => setFilters(CLEARED) : undefined}
      />

      {tenantChipLabel ? (
        <div className={styles.chipRow}>
          <Tag
            closable
            closeIcon={<CloseOutlined aria-label={t('filters.removeTenant')} />}
            onClose={() => setFilters({ tenantId: undefined })}
          >
            {tenantChipLabel}
          </Tag>
        </div>
      ) : null}

      <AdminVehicleTable
        items={items}
        meta={meta}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters(CLEARED)}
        onView={(id) => openVehicle(id)}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        selectedId={openId ?? null}
        dateColumn={filters.sort === PLATFORM_VEHICLE_SORT.UPDATED ? 'updatedAt' : 'createdAt'}
      />

      <AdminVehicleDetailDrawer
        vehicleId={openId ?? null}
        previousId={pager.previousId}
        nextId={pager.nextId}
        onNavigate={(id) => openVehicle(id)}
        onClose={() => openVehicle(undefined)}
      />
    </div>
  );
}
