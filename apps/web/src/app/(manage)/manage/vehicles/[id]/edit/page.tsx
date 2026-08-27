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
import { VehicleEditWorkspace } from '@/features/vehicles/components/VehicleEditWorkspace';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import type { UpdateVehicleInput } from '@/features/vehicles/types';

export default function EditVehiclePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { has } = usePermissions();
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);
  // Không gọi API khi chưa có quyền sửa: tránh một request chắc chắn bị guard backend từ chối.
  const {
    data: vehicle,
    isLoading,
    isError,
    error,
    refetch,
  } = useVehicle(canEdit ? id : undefined);
  const update = useUpdateVehicle(id);

  const backToDetail = () => router.push(vehiclePath.detail(id));

  async function handleSubmit(body: UpdateVehicleInput) {
    try {
      const updated = await update.mutateAsync(body);
      message.success('Đã lưu thay đổi');
      return updated;
    } catch (err) {
      message.error(getErrorMessage(err));
      throw err;
    }
  }

  // Figma `62:893` edit-vehicle-permission-denied — thay toàn bộ trang, không dựng form chỉ-xem.
  if (!canEdit) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền sửa xe"
        description="Bạn cần quyền dưới đây để chỉnh sửa thông tin xe. Liên hệ quản trị viên để được cấp quyền."
        missingPermissions={[PERMISSION.VEHICLE_UPDATE]}
        action={
          <Link href={vehiclePath.detail(id)}>
            <Button type="primary">Xem chi tiết xe</Button>
          </Link>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <ManagePageHeader title="Sửa xe" onBack={backToDetail} />
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
        // Không retry cho 404 (EmptyState R10) — thử lại một bản ghi không tồn tại là ngõ cụt.
        onRetry={notFound ? undefined : () => void refetch()}
        action={<Button onClick={() => router.push(ROUTES.MANAGE.VEHICLES)}>Về danh sách</Button>}
      />
    );
  }

  return (
    <PageContainer>
      <ManagePageHeader title="Chỉnh sửa xe" onBack={backToDetail} />
      <VehicleEditWorkspace
        vehicle={vehicle}
        submitting={update.isPending}
        errorMessage={update.isError ? getErrorMessage(update.error) : null}
        onSave={handleSubmit}
        onCancel={backToDetail}
      />
    </PageContainer>
  );
}
