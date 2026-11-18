'use client';

import { App, Button } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, SERVICE_TYPE, SUPPORT_VEHICLE_CREATE_FIELDS } from '@xeprime/types';
import { patchVehicleServiceSetting } from '@/features/vehicle-manage/api';
import type { VehicleFormValues } from '@xeprime/validators';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { ROUTES } from '@/constants/routes';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { PlanQuotaGateAlert } from '@/features/subscription/components/PlanQuotaGateAlert';
import { planQuotaGateFrom } from '@/features/subscription/plan-quota-gate';
import { usePlanAwareErrorMessage } from '@/features/subscription/use-plan-quota-gate-message';
import { submitVehiclePublic } from '../api';
import { useCreateVehicle } from '../hooks/use-vehicle-mutations';
import { formValuesToInput } from '../mappers';
import type { CreateVehicleInput, VehicleDetail } from '../types';
import { VehicleCreateSuccess } from './VehicleCreateSuccess';
import { VehicleForm, type VehicleSubmitOptions } from './VehicleForm';
import styles from './CreateVehiclePage.module.css';

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
  /* Lỗi hạn mức gói (ADR 0065) nói đúng loại xe + con số thay cho câu chung. */
  const errorMessage = usePlanAwareErrorMessage();
  const { has } = usePermissions();
  const support = useSupportSession();
  const create = useCreateVehicle();
  const [created, setCreated] = useState<{
    vehicle: VehicleDetail;
    submittedForReview: boolean;
    /** Lỗi của lượt gửi duyệt khi xe đã tạo nhưng server từ chối - màn kết quả nêu lý do. */
    submitError?: unknown;
  } | null>(null);

  const createGate = create.isError ? planQuotaGateFrom(create.error) : null;

  const backToList = () => router.push(ROUTES.MANAGE.VEHICLES);

  async function handleSubmit(
    values: VehicleFormValues,
    { submitForReview, registration, autoAcceptEnabled }: VehicleSubmitOptions,
  ) {
    // `tenantId` KHÔNG nằm trong payload: backend lấy từ membership/scope (CLAUDE.md §6.1).
    // Cà vẹt (ADR 0089) gắn vào xe trong CÙNG transaction tạo xe ở server.
    const input: CreateVehicleInput = registration
      ? { ...formValuesToInput(values), registration }
      : formValuesToInput(values);
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

    /*
     * "Tự động đồng ý nhận chuyến" (bước Dịch vụ & giá) là thiết lập của dịch vụ TỰ LÁI, ghi sau khi
     * xe đã có id — cùng đường với luồng đăng nhanh. Hỏng thì xe VẪN đã tạo: báo rõ, không ném tiếp
     * (bấm lại sẽ tạo xe thứ hai), chủ xe bật lại ở màn sửa xe.
     */
    if (autoAcceptEnabled && !support) {
      try {
        await patchVehicleServiceSetting(vehicle.id, SERVICE_TYPE.SELF_DRIVE, {
          autoAcceptEnabled: true,
        });
      } catch (error) {
        message.warning(t('autoAcceptNotSaved', { error: errorMessage(error) }));
      }
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
      setCreated({ vehicle, submittedForReview: false, submitError: error });
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
          submitError={created.submitError}
          onCreateAnother={() => setCreated(null)}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      {/* Figma `24352:79237`: nút lùi tròn có viền + tiêu đề 20/30 - chỉnh ở `figmaHeader`. */}
      <div className={styles.figmaHeader}>
        <ManagePageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          onBack={backToList}
          // Breadcrumb "Danh sách xe › Thêm xe mới" do khung menu tự dựng - thêm `parent` là lặp mục cha.
        />
      </div>
      {/*
        Gói chưa phủ loại xe vừa chọn / đã hết suất: dải có nút tới ĐÚNG làn gói (ADR 0065). Toast
        ở trên biến mất sau vài giây; người dùng cần một lối đi tiếp còn đứng đó khi họ quay lại.
      */}
      {createGate ? <PlanQuotaGateAlert gate={createGate} className={styles.gate} /> : null}
      <VehicleForm
        submitting={create.isPending}
        errorMessage={create.isError ? errorMessage(create.error) : null}
        onSubmit={handleSubmit}
        onCancel={backToList}
      />
    </PageContainer>
  );
}
