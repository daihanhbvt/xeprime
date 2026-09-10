'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useFieldArray, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
import * as yup from 'yup';
import {
  HANDOVER_WINDOW_MAX_PER_KIND,
  TURNAROUND_BUFFER_MAX_MINUTES,
  TURNAROUND_BUFFER_PRESET_MINUTES,
  handoverTimeToMinute,
  minuteToHandoverTime,
} from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { useSaveVehicleOperationSettings, useVehicleOperationSettings } from '../../hooks';
import type { VehicleOperationSettings } from '../../types';
import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './HandoverTimeSection.module.css';

/** Mốc cách nhau 30 phút, 00:00 → 24:00 — nhãn là chính giá trị (HH:mm không cần dịch). */
const TIME_OPTIONS = Array.from({ length: 49 }, (_, i) => {
  const value = minuteToHandoverTime(i * 30);
  return { value, label: value };
});

const windowSchema = yup.object({
  start: yup.string().required('startEnd'),
  end: yup
    .string()
    .required('startEnd')
    .test('after', 'startEnd', (end, ctx) => {
      const start = handoverTimeToMinute(String(ctx.parent.start ?? ''));
      const finish = handoverTimeToMinute(String(end ?? ''));
      return start != null && finish != null && finish > start;
    }),
});

/** Cùng luật với server (`normalizeWindows`) và EXCLUDE ở DB: không chồng lấn, không qua nửa đêm. */
const windowsSchema = yup
  .array()
  .of(windowSchema)
  .defined()
  .max(HANDOVER_WINDOW_MAX_PER_KIND, 'maxWindows')
  .test('overlap', 'overlap', (windows) => {
    if (!windows) return true;
    const sorted = windows
      .map((w) => ({ s: handoverTimeToMinute(w.start) ?? 0, e: handoverTimeToMinute(w.end) ?? 0 }))
      .sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.s < sorted[i - 1]!.e) return false;
    }
    return true;
  });

const schema = yup.object({
  pickupWindows: windowsSchema,
  returnWindows: windowsSchema,
  turnaroundBufferMinutes: yup
    .number()
    .integer('bufferRange')
    .min(0, 'bufferRange')
    .max(TURNAROUND_BUFFER_MAX_MINUTES, 'bufferRange')
    .required('bufferRange'),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Mục "Thời gian giao nhận" (mockup 9): khung giờ giao / nhận trong ngày + thời gian chết giữa
 * hai chuyến. Server enforce khung giờ lúc khách gửi yêu cầu; thời gian chết đi vào
 * `vehicle_occupancies.buffer_minutes` của lịch giữ MỚI (ADR 0006) — màn hình nói rõ phạm vi đó.
 */
export function HandoverTimeSection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const settings = useVehicleOperationSettings(vehicle.id);

  if (settings.isLoading) return <LoadingState variant="page" />;
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
  return <HandoverForm settings={settings.data} canEdit={canEdit} vehicleId={vehicle.id} />;
}

function HandoverForm({
  settings,
  canEdit,
  vehicleId,
}: {
  settings: VehicleOperationSettings;
  canEdit: boolean;
  vehicleId: string;
}) {
  const t = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const save = useSaveVehicleOperationSettings(vehicleId);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.handover.validation');

  const values = useMemo<FormValues>(
    () => ({
      pickupWindows: settings.pickupWindows,
      returnWindows: settings.returnWindows,
      turnaroundBufferMinutes: settings.turnaroundBufferMinutes,
    }),
    [settings],
  );
  const { control, handleSubmit, reset, formState, setValue } = useForm<FormValues>({
    resolver,
    values,
  });
  const buffer = useWatch({ control, name: 'turnaroundBufferMinutes' });
  const isPreset = (TURNAROUND_BUFFER_PRESET_MINUTES as readonly number[]).includes(buffer);

  const submit = handleSubmit(async (next) => {
    try {
      const saved = await save.mutateAsync({
        pickupWindows: next.pickupWindows,
        returnWindows: next.returnWindows,
        turnaroundBufferMinutes: next.turnaroundBufferMinutes,
      });
      reset({
        pickupWindows: saved.pickupWindows,
        returnWindows: saved.returnWindows,
        turnaroundBufferMinutes: saved.turnaroundBufferMinutes,
      });
      message.success(t('handover.saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  });

  return (
    <Form component={false} layout="vertical" colon={false}>
      <form noValidate onSubmit={submit} className={styles.form}>
        <SectionCard headingLevel={1} title={t('handover.title')} subtitle={t('handover.subtitle')}>
          <WindowsEditor
            control={control}
            name="pickupWindows"
            title={t('handover.pickupTitle')}
            disabled={!canEdit}
          />
          <WindowsEditor
            control={control}
            name="returnWindows"
            title={t('handover.returnTitle')}
            disabled={!canEdit}
          />
          <p className={styles.note}>{t('handover.allDay')}</p>
        </SectionCard>

        <SectionCard title={t('handover.bufferTitle')} subtitle={t('handover.bufferHint')}>
          <Radio.Group
            value={isPreset ? buffer : 'custom'}
            disabled={!canEdit}
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
            <div className={styles.customBuffer}>
              <NumberField
                control={control}
                name="turnaroundBufferMinutes"
                label={t('handover.bufferCustomLabel')}
                min={0}
                max={TURNAROUND_BUFFER_MAX_MINUTES}
              />
            </div>
          ) : null}
          <Alert type="info" showIcon message={t('handover.scopeNote')} />
        </SectionCard>

        <StickyFormActions
          submitLabel={tActions('saveChanges')}
          cancelLabel={tActions('cancel')}
          onCancel={formState.isDirty ? () => reset(values) : undefined}
          submitting={save.isPending}
          disabled={!canEdit || !formState.isDirty}
        />
      </form>
    </Form>
  );
}

function WindowsEditor({
  control,
  name,
  title,
  disabled,
}: {
  control: Control<FormValues>;
  name: 'pickupWindows' | 'returnWindows';
  title: string;
  disabled: boolean;
}) {
  const t = useTranslations('VehicleManage.handover');
  const { fields, append, remove } = useFieldArray({ control, name });
  const { errors } = useFormState({ control, name });
  // Lỗi CHÉO của cả mảng (chồng lấn, quá số mốc) nằm ở root — lỗi từng ô do SelectField tự hiện.
  const error = errors[name] as { root?: { message?: string }; message?: string } | undefined;
  const crossMessage = error?.root?.message ?? error?.message;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{title}</legend>
      {fields.map((field, index) => (
        <div key={field.id} className={styles.row}>
          <span className={styles.rowLabel}>{t('from')}</span>
          <SelectField
            control={control}
            name={`${name}.${index}.start`}
            label={`${t('from')} ${index + 1}`}
            options={TIME_OPTIONS}
            disabled={disabled}
          />
          <span className={styles.rowLabel}>{t('to')}</span>
          <SelectField
            control={control}
            name={`${name}.${index}.end`}
            label={`${t('to')} ${index + 1}`}
            options={TIME_OPTIONS}
            disabled={disabled}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined aria-hidden="true" />}
            aria-label={t('removeWindow', { index: index + 1 })}
            onClick={() => remove(index)}
            disabled={disabled}
          />
        </div>
      ))}
      {crossMessage ? (
        <p className={styles.error} role="alert">
          {crossMessage}
        </p>
      ) : null}
      <Button
        type="link"
        icon={<PlusOutlined aria-hidden="true" />}
        disabled={disabled || fields.length >= HANDOVER_WINDOW_MAX_PER_KIND}
        onClick={() => append({ start: '06:00', end: '22:00' })}
        className={styles.add}
      >
        {t('addWindow')}
      </Button>
      {fields.length >= HANDOVER_WINDOW_MAX_PER_KIND ? (
        <p className={styles.note}>{t('maxWindows', { max: HANDOVER_WINDOW_MAX_PER_KIND })}</p>
      ) : null}
    </fieldset>
  );
}
