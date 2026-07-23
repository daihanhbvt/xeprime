'use client';

import { App, Button, Result, Skeleton, Space } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { API_ERROR_CODE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleForm } from '@/features/vehicles/components/VehicleForm';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { formValuesToInput, vehicleToFormValues } from '@/features/vehicles/mappers';

export default function EditVehiclePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: vehicle, isLoading, isError, error, refetch } = useVehicle(id);
  const update = useUpdateVehicle(id);

  const backToDetail = () => router.push(vehiclePath.detail(id));

  function handleSubmit(values: VehicleFormValues) {
    update.mutate(formValuesToInput(values), {
      onSuccess: () => {
        message.success('Đã lưu thay đổi');
        router.replace(vehiclePath.detail(id));
      },
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  if (isLoading) {
    return (
      <div>
        <ManagePageHeader title="Sửa xe" onBack={backToDetail} />
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
            <Button onClick={() => router.push(ROUTES.MANAGE.VEHICLES)}>Về danh sách</Button>
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
      <ManagePageHeader title={`Sửa: ${vehicle.name}`} onBack={backToDetail} />
      <VehicleForm
        initialValues={vehicleToFormValues(vehicle)}
        submitLabel="Lưu thay đổi"
        submitting={update.isPending}
        errorMessage={update.isError ? getErrorMessage(update.error) : null}
        onSubmit={handleSubmit}
        onCancel={backToDetail}
      />
    </div>
  );
}
