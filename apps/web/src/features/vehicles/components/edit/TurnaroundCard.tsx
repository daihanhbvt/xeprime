'use client';

import { App, Form, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { TURNAROUND_BUFFER_MAX_MINUTES, TURNAROUND_BUFFER_PRESET_MINUTES } from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import {
  useSaveVehicleOperationSettings,
  useVehicleOperationSettings,
} from '@/features/vehicle-manage/hooks';
import type { VehicleOperationSettings } from '@/features/vehicle-manage/types';
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

  const values = useMemo<FormValues>(
    () => ({ turnaroundBufferMinutes: settings.turnaroundBufferMinutes }),
    [settings],
  );
  const { control, handleSubmit, reset, formState, setValue } = useForm<FormValues>({
    resolver,
    values,
  });
  const buffer = useWatch({ control, name: 'turnaroundBufferMinutes' });
  const isPreset = (TURNAROUND_BUFFER_PRESET_MINUTES as readonly number[]).includes(buffer);

  function submit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (next) => {
          try {
            const saved = await save.mutateAsync({
              turnaroundBufferMinutes: next.turnaroundBufferMinutes,
            });
            reset({ turnaroundBufferMinutes: saved.turnaroundBufferMinutes });
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
        <Radio.Group
          value={isPreset ? buffer : 'custom'}
          disabled={!canEdit}
          optionType="button"
          onChange={(event) => {
            const next = event.target.value as number | 'custom';
            setValue('turnaroundBufferMinutes', next === 'custom' ? 30 : next, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          className={styles.bufferOptions}
        >
          {TURNAROUND_BUFFER_PRESET_MINUTES.map((minutes) => (
            <Radio.Button key={minutes} value={minutes}>
              {minutes === 0
                ? t('handover.bufferNone')
                : t('common.hours', { count: minutes / 60 })}
            </Radio.Button>
          ))}
          <Radio.Button value="custom">{t('handover.bufferCustom')}</Radio.Button>
        </Radio.Group>
        {!isPreset ? (
          <div className={styles.bufferCustom}>
            <NumberField
              control={control}
              name="turnaroundBufferMinutes"
              label={t('handover.bufferCustomLabel')}
              min={0}
              max={TURNAROUND_BUFFER_MAX_MINUTES}
            />
          </div>
        ) : null}
      </EditCard>
    </Form>
  );
}
