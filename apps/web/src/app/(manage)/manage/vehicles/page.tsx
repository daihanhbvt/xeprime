'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { FleetSummaryBar } from '@/features/vehicles/components/FleetSummaryBar';
import { VehicleFiltersBar } from '@/features/vehicles/components/VehicleFilters';
import { VehicleCardGrid } from '@/features/vehicles/components/VehicleCardGrid';
import { VehicleStatusChips } from '@/features/vehicles/components/VehicleStatusChips';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useVehicleRowActions } from '@/features/vehicles/hooks/use-vehicle-row-actions';
import { useVehicleFilters } from '@/features/vehicles/hooks/use-vehicle-filters';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { VEHICLES_DEFAULT_LIMIT } from '@/features/vehicles/api';

export default function VehiclesPage() {
  const t = useTranslations('Vehicles.list.page');

  // useVehicleFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<LoadingState variant="page" label={t('loading')} />}>
      <VehiclesView />
    </Suspense>
  );
}

function VehiclesView() {
  const t = useTranslations('Vehicles.list.page');
  const tManage = useTranslations('ManageCommon.permission');
  const rowActions = useVehicleRowActions();
  const router = useRouter();
  const { has } = usePermissions();
  const isMobile = useIsMobile();
  const { filters, setFilters } = useVehicleFilters();
  const { data, isError, refetch, isFetching } = useVehicles(filters);

  const canView = has(PERMISSION.VEHICLE_VIEW);
  const canCreate = has(PERMISSION.VEHICLE_CREATE);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: VEHICLES_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(
    filters.q ||
    filters.vehicleType ||
    filters.serviceType ||
    filters.operationStatus ||
    filters.publicStatus,
  );

  function clearFilters() {
    setFilters({
      q: undefined,
      vehicleType: undefined,
      serviceType: undefined,
      operationStatus: undefined,
      publicStatus: undefined,
    });
  }

  const emptyAction = canCreate ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => router.push(ROUTES.MANAGE.VEHICLE_NEW)}
    >
      {t('addFirstVehicle')}
    </Button>
  ) : undefined;

  /** "Xem lịch" của một xe — cùng một đích với nút ở Hồ sơ 360 (`vehicleSchedulePath`). */
  function openSchedule(row: { name: string; plateNumber?: string | null }) {
    router.push(vehicleSchedulePath(row));
  }

  // Thiếu quyền xem → thay TOÀN BỘ nội dung, không dựng tiêu đề và bộ lọc cho một trang không
  // xem được (Figma `188:2290`). Đây chỉ là lớp trải nghiệm; chặn thật là guard backend.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{tManage('backHome')}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <ManagePageHeader
        title={t('title')}
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(ROUTES.MANAGE.VEHICLE_NEW)}
            >
              {t('addVehicle')}
            </Button>
          ) : null
        }
      />

      {/* Hai khối chỉ-mobile theo Figma `236:4632`: dải chỉ số đội xe + chip lọc một-chạm. */}
      {isMobile ? (
        <>
          <FleetSummaryBar enabled />
          <VehicleStatusChips
            value={filters.operationStatus}
            onChange={(operationStatus) => setFilters({ operationStatus })}
          />
        </>
      ) : null}

      <VehicleFiltersBar filters={filters} onChange={setFilters} onClear={clearFilters} />

      <VehicleCardGrid
        items={items}
        meta={meta}
        loading={isFetching}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ danh sách đang đọc.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={clearFilters}
        emptyAction={emptyAction}
        rowActions={(row, shape) =>
          rowActions({
            row,
            canEdit,
            compact: shape === 'row',
            onView: (id) => router.push(vehiclePath.detail(id)),
            onEdit: (id) => router.push(vehiclePath.edit(id)),
            onSchedule: openSchedule,
          })
        }
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
