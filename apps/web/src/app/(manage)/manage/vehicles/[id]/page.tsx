'use client';

import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { App, Button, Popconfirm } from 'antd';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { usePermissions } from '@/hooks/use-permissions';
import { decorativeIcon } from '@/lib/decorative-icon';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleDetailView } from '@/features/vehicles/components/VehicleDetailView';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useDeleteVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';

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

  // Cùng quy tắc với danh sách (Figma `58:2061`): không có quyền xem thì không dựng gì của bản ghi.
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
      <div>
        <ManagePageHeader title="Chi tiết xe" onBack={backToList} />
        <LoadingState variant="page" label="Đang tải thông tin xe…" />
      </div>
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
    <div>
      <ManagePageHeader
        title={vehicle.name}
        onBack={backToList}
        extra={
          <>
            {has(PERMISSION.VEHICLE_UPDATE) ? (
              // Icon là trang trí: để nguyên thì tên khả truy cập thành "edit Chỉnh sửa" (D16.1).
              <Button
                icon={decorativeIcon(<EditOutlined />)}
                onClick={() => router.push(vehiclePath.edit(id))}
              >
                Chỉnh sửa
              </Button>
            ) : null}
            {has(PERMISSION.VEHICLE_DELETE) ? (
              <Popconfirm
                title="Xoá xe này?"
                description="Xe sẽ bị ẩn khỏi danh sách. Không xoá được nếu còn lịch."
                okText="Xoá"
                okButtonProps={{ danger: true }}
                cancelText="Huỷ"
                onConfirm={handleDelete}
              >
                <Button
                  danger
                  icon={decorativeIcon(<DeleteOutlined />)}
                  loading={deleteVehicle.isPending}
                  aria-label="Xoá xe"
                />
              </Popconfirm>
            ) : null}
          </>
        }
      />
      <VehicleDetailView vehicle={vehicle} />
    </div>
  );
}
