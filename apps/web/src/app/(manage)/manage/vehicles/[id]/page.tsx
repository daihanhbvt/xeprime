'use client';

import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { App, Button, Popconfirm, Result, Skeleton, Space } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { usePermissions } from '@/hooks/use-permissions';
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
  const { data: vehicle, isLoading, isError, error, refetch } = useVehicle(id);
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

  if (isLoading) {
    return (
      <div>
        <ManagePageHeader title="Chi tiết xe" onBack={backToList} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !vehicle) {
    const notFound = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <Result
        status={notFound ? '404' : 'error'}
        title={notFound ? 'Không tìm thấy xe' : 'Không tải được thông tin xe'}
        subTitle={notFound ? 'Xe có thể đã bị xoá.' : 'Có lỗi khi lấy dữ liệu.'}
        extra={
          <Space>
            <Button onClick={backToList}>Về danh sách</Button>
            {!notFound ? (
              <Button type="primary" onClick={() => void refetch()}>
                Thử lại
              </Button>
            ) : null}
          </Space>
        }
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
              <Button
                icon={<EditOutlined />}
                onClick={() => router.push(vehiclePath.edit(id))}
              >
                Sửa
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
                <Button danger icon={<DeleteOutlined />} loading={deleteVehicle.isPending}>
                  Xoá
                </Button>
              </Popconfirm>
            ) : null}
          </>
        }
      />
      <VehicleDetailView vehicle={vehicle} />
    </div>
  );
}
