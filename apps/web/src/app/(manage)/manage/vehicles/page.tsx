'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Empty, Result, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleFiltersBar } from '@/features/vehicles/components/VehicleFilters';
import { VehicleTable } from '@/features/vehicles/components/VehicleTable';
import { useDeleteVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { useVehicleFilters } from '@/features/vehicles/hooks/use-vehicle-filters';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import { VEHICLES_DEFAULT_LIMIT } from '@/features/vehicles/api';
import styles from './vehicles-page.module.css';

export default function VehiclesPage() {
  // useVehicleFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
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

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được danh sách xe"
          subTitle="Có lỗi khi lấy dữ liệu. Vui lòng thử lại."
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        hasFilters ? (
          <Empty className={styles.state} description="Không tìm thấy xe khớp bộ lọc">
            <Button onClick={() => setFilters({ q: undefined, vehicleType: undefined, serviceType: undefined, operationStatus: undefined, publicStatus: undefined })}>
              Xoá bộ lọc
            </Button>
          </Empty>
        ) : (
          <Empty className={styles.state} description="Gian hàng chưa có xe nào">
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push(ROUTES.MANAGE.VEHICLE_NEW)}
              >
                Thêm xe đầu tiên
              </Button>
            ) : null}
          </Empty>
        )
      ) : (
        <VehicleTable
          items={items}
          meta={meta}
          loading={isFetching}
          deletingId={deleteVehicle.isPending ? (deleteVehicle.variables ?? null) : null}
          canEdit={canEdit}
          canDelete={canDelete}
          onView={(id) => router.push(vehiclePath.detail(id))}
          onEdit={(id) => router.push(vehiclePath.edit(id))}
          onDelete={handleDelete}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}
    </div>
  );
}
