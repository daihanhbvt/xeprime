'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { usePermissions } from '@/hooks/use-permissions';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { Vehicle360Overview } from '@/features/vehicles/components/Vehicle360Overview';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useVehicleSummary } from '@/features/vehicles/hooks/use-vehicle-summary';
import { useDeleteVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';

/**
 * Hồ sơ 360 của một xe — Figma `236:2222` (desktop) · `236:4783` (mobile).
 *
 * Trang chỉ điều phối: quyền, hai query (bản ghi xe + tổng hợp), và các trạng thái
 * loading/lỗi/không-tìm-thấy. Toàn bộ trình bày nằm ở `Vehicle360Overview`.
 */
export default function VehicleDetailPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const {
    data: vehicle,
    isLoading,
    isError,
    error,
    refetch,
  } = useVehicle(canView ? id : undefined);
  // Tổng hợp (chỉ số + đơn thuê) tách query riêng: chậm hay hỏng cũng không kéo sập hồ sơ.
  const summary = useVehicleSummary(canView ? id : undefined);
  const deleteVehicle = useDeleteVehicle();

  const backToList = () => router.push(ROUTES.MANAGE.VEHICLES);

  function handleDelete() {
    deleteVehicle.mutate(id, {
      onSuccess: () => {
        message.success('Đã xoá xe');
        router.replace(ROUTES.MANAGE.VEHICLES);
      },
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  // Cùng quy tắc với danh sách: không có quyền xem thì không dựng gì của bản ghi.
  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền xem xe"
        description="Bạn cần quyền dưới đây để xem thông tin xe. Liên hệ quản trị viên để được cấp quyền."
        missingPermissions={[PERMISSION.VEHICLE_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">Về trang chủ</Button>
          </Link>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <ManagePageHeader title="Hồ sơ chi tiết xe" onBack={backToList} />
        <LoadingState variant="page" label="Đang tải thông tin xe…" />
      </PageContainer>
    );
  }

  if (isError || !vehicle) {
    const notFound = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant="error"
        title={notFound ? 'Không tìm thấy xe' : 'Không tải được thông tin xe'}
        description={
          notFound
            ? 'Xe có thể đã bị xoá hoặc không thuộc gian hàng này.'
            : 'Có lỗi khi lấy dữ liệu. Vui lòng thử lại.'
        }
        onRetry={notFound ? undefined : () => void refetch()}
        action={<Button onClick={backToList}>Về danh sách</Button>}
      />
    );
  }

  return (
    <PageContainer>
      <ManagePageHeader
        title="Hồ sơ chi tiết xe"
        subtitle="Thông tin vận hành, giá thuê và trạng thái công khai của phương tiện"
        onBack={backToList}
      />
      <Vehicle360Overview
        vehicle={vehicle}
        summary={summary.data}
        summaryLoading={summary.isLoading}
        summaryFailed={summary.isError}
        canEdit={has(PERMISSION.VEHICLE_UPDATE)}
        canDelete={has(PERMISSION.VEHICLE_DELETE)}
        deletePending={deleteVehicle.isPending}
        onEdit={() => router.push(vehiclePath.edit(id))}
        onSchedule={() => router.push(vehicleSchedulePath(vehicle))}
        onDelete={handleDelete}
      />
    </PageContainer>
  );
}
