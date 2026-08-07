'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleFiltersBar } from '@/features/vehicles/components/VehicleFilters';
import { VehicleTable } from '@/features/vehicles/components/VehicleTable';
import { useDeleteVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { useVehicleFilters } from '@/features/vehicles/hooks/use-vehicle-filters';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { VEHICLES_DEFAULT_LIMIT } from '@/features/vehicles/api';

export default function VehiclesPage() {
  // useVehicleFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<LoadingState variant="page" label="Đang tải danh sách xe…" />}>
      <VehiclesView />
    </Suspense>
  );
}

function VehiclesView() {
  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const { filters, setFilters } = useVehicleFilters();
  const { data, isError, refetch, isFetching } = useVehicles(filters);
  const deleteVehicle = useDeleteVehicle();

  const canCreate = has(PERMISSION.VEHICLE_CREATE);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  const canDelete = has(PERMISSION.VEHICLE_DELETE);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: VEHICLES_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(
    filters.q ||
    filters.vehicleType ||
    filters.serviceType ||
    filters.operationStatus ||
    filters.publicStatus,
  );

  function handleDelete(id: string) {
    deleteVehicle.mutate(id, {
      onSuccess: () => message.success('Đã xoá xe'),
      onError: (error) => message.error(getErrorMessage(error)),
    });
  }

  return (
    <div>
      <ManagePageHeader
        title="Danh sách xe"
        extra={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(ROUTES.MANAGE.VEHICLE_NEW)}
            >
              Thêm xe
            </Button>
          ) : null
        }
      />

      <VehicleFiltersBar filters={filters} onChange={setFilters} />

      <VehicleTable
        items={items}
        meta={meta}
        loading={isFetching}
        deletingId={deleteVehicle.isPending ? (deleteVehicle.variables ?? null) : null}
        canEdit={canEdit}
        canDelete={canDelete}
        // Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ bảng đang đọc.
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() =>
          setFilters({
            q: undefined,
            vehicleType: undefined,
            serviceType: undefined,
            operationStatus: undefined,
            publicStatus: undefined,
          })
        }
        emptyAction={
          canCreate ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(ROUTES.MANAGE.VEHICLE_NEW)}
            >
              Thêm xe đầu tiên
            </Button>
          ) : undefined
        }
        onView={(id) => router.push(vehiclePath.detail(id))}
        onEdit={(id) => router.push(vehiclePath.edit(id))}
        onDelete={handleDelete}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
