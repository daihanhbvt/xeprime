'use client';

import { App } from 'antd';
import { useRouter } from 'next/navigation';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { getErrorMessage } from '@/services/api-client';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleForm } from '@/features/vehicles/components/VehicleForm';
import { useCreateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { formValuesToInput } from '@/features/vehicles/mappers';

export default function NewVehiclePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const create = useCreateVehicle();

  function handleSubmit(values: VehicleFormValues) {
    create.mutate(formValuesToInput(values), {
      onSuccess: (vehicle) => {
        message.success('Đã thêm xe');
        router.replace(vehiclePath.detail(vehicle.id));
      },
      onError: (error) => message.error(getErrorMessage(error)),
    });
  }

  return (
    <div>
      <ManagePageHeader title="Thêm xe" onBack={() => router.push(ROUTES.MANAGE.VEHICLES)} />
      <VehicleForm
        submitLabel="Thêm xe"
        submitting={create.isPending}
        errorMessage={create.isError ? getErrorMessage(create.error) : null}
        onSubmit={handleSubmit}
        onCancel={() => router.push(ROUTES.MANAGE.VEHICLES)}
      />
    </div>
  );
}
