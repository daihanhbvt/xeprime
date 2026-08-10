'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleFiltersBar } from '@/features/vehicles/components/VehicleFilters';
import { VehicleCardGrid } from '@/features/vehicles/components/VehicleCardGrid';
import { vehicleRowActions } from '@/features/vehicles/row-actions';
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

  const canView = has(PERMISSION.VEHICLE_VIEW);
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

  function clearFilters() {
    setFilters({
      q: undefined,
      vehicleType: undefined,
      serviceType: undefined,
      operationStatus: undefined,
      publicStatus: undefined,
    });
  }

  const deletingId = deleteVehicle.isPending ? (deleteVehicle.variables ?? null) : null;

  const emptyAction = canCreate ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => router.push(ROUTES.MANAGE.VEHICLE_NEW)}
    >
      Thêm xe đầu tiên
    </Button>
  ) : undefined;

  /**
   * "Xem lịch" của một xe.
   *
   * Chưa có route lịch riêng cho từng xe; màn lịch dùng chung nhận `q` lọc theo tên/biển số
   * (`calendar.controller`). Nên ở đây lọc lịch về đúng xe đó thay vì bịa ra một route mới.
   * Ưu tiên biển số vì nó phân biệt tốt hơn tên xe trùng lặp.
   */
  function openSchedule(row: { name: string; plateNumber?: string | null }) {
    const query = new URLSearchParams({ q: row.plateNumber || row.name });
    router.push(`${ROUTES.MANAGE.CALENDAR}?${query.toString()}`);
  }

  function handleDelete(id: string) {
    deleteVehicle.mutate(id, {
      onSuccess: () => message.success('Đã xoá xe'),
      onError: (error) => message.error(getErrorMessage(error)),
    });
  }

  // Thiếu quyền xem → thay TOÀN BỘ nội dung, không dựng tiêu đề và bộ lọc cho một trang không
  // xem được (Figma `188:2290`). Đây chỉ là lớp trải nghiệm; chặn thật là guard backend.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền truy cập"
        description="Bạn cần quyền dưới đây để xem trang này. Liên hệ quản trị viên để được cấp quyền."
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">Về trang chủ</Button>
          </Link>
        }
      />
    );
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
        rowActions={(row) =>
          vehicleRowActions({
            row,
            canEdit,
            canDelete,
            deletingId,
            onView: (id) => router.push(vehiclePath.detail(id)),
            onEdit: (id) => router.push(vehiclePath.edit(id)),
            onSchedule: openSchedule,
            onDelete: handleDelete,
          })
        }
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />
    </div>
  );
}
