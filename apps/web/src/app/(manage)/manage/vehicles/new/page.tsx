'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PERMISSION } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES, vehiclePath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { VehicleForm } from '@/features/vehicles/components/VehicleForm';
import { useCreateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { formValuesToInput } from '@/features/vehicles/mappers';

export default function NewVehiclePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const create = useCreateVehicle();

  const backToList = () => router.push(ROUTES.MANAGE.VEHICLES);

  function handleSubmit(values: VehicleFormValues) {
    // `tenantId` KHÔNG nằm trong payload: backend lấy từ membership/scope (CLAUDE.md §6.1,
    // ma trận trường Figma `65:5222` — "Server only, from membership scope").
    create.mutate(formValuesToInput(values), {
      onSuccess: (vehicle) => {
        message.success('Đã thêm xe');
        router.replace(vehiclePath.detail(vehicle.id));
      },
      onError: (error) => message.error(getErrorMessage(error)),
    });
  }

  // Thiếu quyền tạo → thay TOÀN BỘ nội dung, không dựng một form không gửi được. Đây chỉ là lớp
  // trải nghiệm; chặn thật là guard backend trên `POST /vehicles`.
  if (!has(PERMISSION.VEHICLE_CREATE)) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền thêm xe"
        description="Bạn cần quyền dưới đây để thêm xe vào gian hàng. Liên hệ quản trị viên để được cấp quyền."
        missingPermissions={[PERMISSION.VEHICLE_CREATE]}
        action={
          <Link href={ROUTES.MANAGE.VEHICLES}>
            <Button type="primary">Về danh sách xe</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <ManagePageHeader title="Thêm xe" onBack={backToList} />
      <VehicleForm
        layout="stepped"
        submitLabel="Lưu thông tin xe"
        submitting={create.isPending}
        errorMessage={create.isError ? getErrorMessage(create.error) : null}
        onSubmit={handleSubmit}
        onCancel={backToList}
      />
    </div>
  );
}
