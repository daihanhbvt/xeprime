'use client';

import { App, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { TURNAROUND_BUFFER_MAX_MINUTES } from '@xeprime/types';

import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { TurnaroundBufferField } from '@/features/rental-policies/components/TurnaroundBufferField';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import {
  useSaveVehicleOperationSettings,
  useVehicleOperationSettings,
} from '@/features/vehicle-manage/hooks';
import type { VehicleOperationSettings } from '@/features/vehicle-manage/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { EditCard } from './EditCard';
import { useEditForm } from './edit-actions';
import styles from './EditPanes.module.css';

const schema = yup.object({
  turnaroundBufferMinutes: yup
    .number()
    .integer('bufferRange')
    .min(0, 'bufferRange')
    .max(TURNAROUND_BUFFER_MAX_MINUTES, 'bufferRange')
    .required('bufferRange'),
  useShopDefault: yup.boolean().defined(),
});
type FormValues = yup.InferType<typeof schema>;

/**
 * "Thời gian chuẩn bị xe giữa hai chuyến" — `PUT /vehicles/:id/operation-settings`, lưu bằng nút ở cột
 * phải. Số phút vào `vehicle_occupancies.buffer_minutes` của lịch giữ MỚI (ADR 0006); thẻ nói rõ
 * phạm vi đó. Khung giờ giao/nhận từng ở cùng form này đã gỡ (ADR 0078): xe nhận và trả mọi giờ.
 */
export function TurnaroundCard({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const settings = useVehicleOperationSettings(vehicleId);

  if (settings.isLoading) return <LoadingState variant="inline" />;
  if (settings.isError || !settings.data) {
    return (
      <EmptyState
        variant="error"
        title={t('common.loadError')}
        description={tCommon('states.errorHint')}
        onRetry={() => void settings.refetch()}
      />
    );
  }
  return <TurnaroundForm settings={settings.data} canEdit={canEdit} vehicleId={vehicleId} />;
}

function TurnaroundForm({
  settings,
  canEdit,
  vehicleId,
}: {
  settings: VehicleOperationSettings;
  canEdit: boolean;
  vehicleId: string;
}) {
  const t = useTranslations('VehicleManage');
  const tPolicy = useTranslations('Vehicles.editor.policy');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const save = useSaveVehicleOperationSettings(vehicleId);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.handover.validation');
  /*
   * "Theo gian hàng" chỉ có ở gian hàng: chủ xe tuyến hoa hồng không có trang chính sách gian hàng,
   * nên mặc định của họ luôn trống (0) — lưu ở đó luôn là số riêng của xe.
   */
  const { isManage } = useWorkspace();

  const values = useMemo<FormValues>(
    () => ({
      turnaroundBufferMinutes: settings.turnaroundBufferMinutes,
      useShopDefault: isManage && settings.useShopDefault,
    }),
    [settings, isManage],
  );
  const { control, handleSubmit, reset, formState, setValue } = useForm<FormValues>({
    resolver,
    values,
  });
  const useShopDefault = useWatch({ control, name: 'useShopDefault' });
  const shopMinutes = settings.shopDefaultMinutes ?? 0;

  function submit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (next) => {
          try {
            const saved = await save.mutateAsync({
              turnaroundBufferMinutes: next.turnaroundBufferMinutes,
              useShopDefault: next.useShopDefault,
            });
            reset({
              turnaroundBufferMinutes: saved.turnaroundBufferMinutes,
              useShopDefault: isManage && saved.useShopDefault,
            });
            message.success(t('handover.saved'));
            resolve(true);
          } catch (err) {
            message.error(errorMessage(err));
            resolve(false);
          }
        },
        () => resolve(false),
      )();
    });
  }

  useEditForm('turnaround', {
    dirty: formState.isDirty,
    submitting: save.isPending,
    submit,
    reset: () => reset(values),
  });

  return (
    <Form component={false} layout="vertical" colon={false} disabled={!canEdit}>
      <EditCard
        title={
          <span className={styles.titleWithTip}>
            {t('handover.bufferTitle')}
            <PolicyInfoTip label={tPolicy('bufferTipLabel')}>
              {t('handover.scopeNote')}
            </PolicyInfoTip>
          </span>
        }
        subtitle={t('handover.bufferHint')}
      >
        <TurnaroundBufferField
          control={control}
          name="turnaroundBufferMinutes"
          label={t('handover.bufferTitle')}
          disabled={!canEdit}
          notice={false}
          inherit={
            isManage
              ? {
                  active: useShopDefault,
                  label: t('handover.bufferShop', { value: formatBuffer(shopMinutes) }),
                  onChange: (active) => {
                    setValue('useShopDefault', active, { shouldDirty: true });
                    // Rời "theo gian hàng" bắt đầu từ chính số đang áp — không nhảy về 0.
                    if (!active && useShopDefault) {
                      setValue('turnaroundBufferMinutes', shopMinutes, { shouldDirty: true });
                    }
                  },
                }
              : undefined
          }
        />
      </EditCard>
    </Form>
  );

  function formatBuffer(minutes: number): string {
    if (minutes === 0) return t('handover.bufferNone');
    if (minutes % 60 === 0) return t('common.hours', { count: minutes / 60 });
    return t('common.minutes', { count: minutes });
  }
}
