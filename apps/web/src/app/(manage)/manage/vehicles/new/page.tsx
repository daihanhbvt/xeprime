'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PERMISSION } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { VehicleForm, type VehicleSubmitOptions } from '@/features/vehicles/components/VehicleForm';
import { VehicleCreateSuccess } from '@/features/vehicles/components/VehicleCreateSuccess';
import { submitVehiclePublic } from '@/features/vehicles/api';
import { useCreateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { formValuesToInput } from '@/features/vehicles/mappers';
import type { VehicleDetail } from '@/features/vehicles/types';
import { useState } from 'react';

export default function NewVehiclePage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const create = useCreateVehicle();
  const [created, setCreated] = useState<{
    vehicle: VehicleDetail;
    submittedForReview: boolean;
  } | null>(null);

  const backToList = () => router.push(ROUTES.MANAGE.VEHICLES);

  /**
   * "Lưu nháp" và "Lưu & Gửi duyệt" (Figma `193:2132`) là **hai hành vi backend có thật**.
   *
   * Cả hai đều `POST /vehicles` (xe luôn sinh ra ở trạng thái nháp — ADR 0008); riêng nhánh gửi
   * duyệt gọi tiếp `POST /vehicles/:id/submit-public`. Bước hai hỏng thì xe VẪN đã được tạo, nên
   * thông báo phải nói rõ điều đó thay vì báo "lỗi tạo xe" — người dùng bấm lại sẽ tạo xe thứ hai.
   */
  async function handleSubmit(
    values: VehicleFormValues,
    { submitForReview }: VehicleSubmitOptions,
  ) {
    // `tenantId` KHÔNG nằm trong payload: backend lấy từ membership/scope (CLAUDE.md §6.1).
    let vehicle: VehicleDetail;
    try {
      vehicle = await create.mutateAsync(formValuesToInput(values));
    } catch (error) {
      message.error(getErrorMessage(error));
      /*
       * NÉM LẠI, không nuốt: wizard cần chính lỗi này để gắn `error.details` vào đúng ô nhập
       * và nhảy về bước chứa nó. Nuốt ở đây thì người dùng chỉ còn một toast chung và phải tự
       * dò ô sai trên cả wizard.
       */
      throw error;
    }

    if (!submitForReview) {
      message.success('Đã lưu nháp xe');
      setCreated({ vehicle, submittedForReview: false });
      return;
    }

    try {
      const submitted = await submitVehiclePublic(vehicle.id);
      message.success('Đã tạo xe và gửi duyệt công khai');
      setCreated({ vehicle: submitted, submittedForReview: true });
    } catch (error) {
      // Xe ĐÃ được tạo — không ném tiếp, nếu không người dùng bấm lại sẽ tạo xe thứ hai.
      message.warning(`Đã tạo xe nhưng chưa gửi duyệt được: ${getErrorMessage(error)}`);
      setCreated({ vehicle, submittedForReview: false });
    }
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

  if (created) {
    return (
      <PageContainer>
        <VehicleCreateSuccess
          vehicle={created.vehicle}
          submittedForReview={created.submittedForReview}
          onCreateAnother={() => setCreated(null)}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ManagePageHeader title="Thêm xe" onBack={backToList} />
      <VehicleForm
        submitting={create.isPending}
        errorMessage={create.isError ? getErrorMessage(create.error) : null}
        onSubmit={handleSubmit}
        onCancel={backToList}
      />
    </PageContainer>
  );
}
