'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, SUPPORT_VEHICLE_CREATE_FIELDS } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { ROUTES } from '@/constants/routes';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { submitVehiclePublic } from '../api';
import { useCreateVehicle } from '../hooks/use-vehicle-mutations';
import { formValuesToInput } from '../mappers';
import type { CreateVehicleInput, VehicleDetail } from '../types';
import { VehicleCreateSuccess } from './VehicleCreateSuccess';
import { VehicleForm, type VehicleSubmitOptions } from './VehicleForm';

const SUPPORT_CREATE_FIELDS = new Set<string>(SUPPORT_VEHICLE_CREATE_FIELDS);

/**
 * Thêm xe — dùng chung bởi `/manage/vehicles/new` và phiên hỗ trợ gian hàng (ADR 0050 §13).
 *
 * "Lưu nháp" và "Lưu & Gửi duyệt" (Figma `193:2132`) là **hai hành vi backend có thật**. Cả hai
 * đều `POST /vehicles` (xe luôn sinh ra ở trạng thái nháp — ADR 0008); riêng nhánh gửi duyệt gọi
 * tiếp `POST /vehicles/:id/submit-public`. Bước hai hỏng thì xe VẪN đã được tạo, nên thông báo phải
 * nói rõ điều đó thay vì báo "lỗi tạo xe" — người dùng bấm lại sẽ tạo xe thứ hai.
 *
 * Trong phiên hỗ trợ chỉ có "Lưu nháp" (wizard tự bỏ bước giá và nút gửi duyệt), và lệnh gửi đi
 * chỉ mang trường của `SUPPORT_VEHICLE_CREATE_FIELDS` — server kiểm lại đúng danh sách đó.
 */
export function CreateVehiclePage() {
  const t = useTranslations('Vehicles.create');
  const router = useRouter();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const support = useSupportSession();
  const create = useCreateVehicle();
  const [created, setCreated] = useState<{
    vehicle: VehicleDetail;
    submittedForReview: boolean;
  } | null>(null);

  const backToList = () => router.push(ROUTES.MANAGE.VEHICLES);

  async function handleSubmit(
    values: VehicleFormValues,
    { submitForReview }: VehicleSubmitOptions,
  ) {
    // `tenantId` KHÔNG nằm trong payload: backend lấy từ membership/scope (CLAUDE.md §6.1).
    const input = formValuesToInput(values);
    const body = support
      ? (Object.fromEntries(
          Object.entries(input).filter(([key]) => SUPPORT_CREATE_FIELDS.has(key)),
        ) as CreateVehicleInput)
      : input;
    let vehicle: VehicleDetail;
    try {
      vehicle = await create.mutateAsync(body);
    } catch (error) {
      message.error(errorMessage(error));
      /*
       * NÉM LẠI, không nuốt: wizard cần chính lỗi này để gắn `error.details` vào đúng ô nhập
       * và nhảy về bước chứa nó. Nuốt ở đây thì người dùng chỉ còn một toast chung và phải tự
       * dò ô sai trên cả wizard.
       */
      throw error;
    }

    if (!submitForReview || support) {
      message.success(t('savedDraft'));
      setCreated({ vehicle, submittedForReview: false });
      return;
    }

    try {
      const submitted = await submitVehiclePublic(vehicle.id);
      message.success(t('createdAndSubmitted'));
      setCreated({ vehicle: submitted, submittedForReview: true });
    } catch (error) {
      // Xe ĐÃ được tạo — không ném tiếp, nếu không người dùng bấm lại sẽ tạo xe thứ hai.
      message.warning(t('createdNotSubmitted', { error: errorMessage(error) }));
      setCreated({ vehicle, submittedForReview: false });
    }
  }

  // Thiếu quyền tạo → thay TOÀN BỘ nội dung, không dựng một form không gửi được. Đây chỉ là lớp
  // trải nghiệm; chặn thật là guard backend trên `POST /vehicles`.
  if (!has(PERMISSION.VEHICLE_CREATE)) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbiddenTitle')}
        description={t('forbiddenBody')}
        missingPermissions={[PERMISSION.VEHICLE_CREATE]}
        action={
          <Link href={ROUTES.MANAGE.VEHICLES}>
            <Button type="primary">{t('backToList')}</Button>
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
      <ManagePageHeader title={t('title')} onBack={backToList} />
      <VehicleForm
        submitting={create.isPending}
        errorMessage={create.isError ? errorMessage(create.error) : null}
        onSubmit={handleSubmit}
        onCancel={backToList}
      />
    </PageContainer>
  );
}
