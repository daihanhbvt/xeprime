'use client';

import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
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
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { VEHICLE_EDIT_TAB } from '@/constants/routes';
import { DeliveryPolicySection } from '@/features/rental-policies/components/PolicySections';
import {
  supportAllowsVehicleTab,
  useSupportSession,
} from '@/features/tenant-support/support-session';
import {
  useSaveVehicleOperationSettings,
  useVehicleOperationSettings,
} from '@/features/vehicle-manage/hooks';
import type { VehicleOperationSettings } from '@/features/vehicle-manage/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import type { VehicleDetail } from '../../types';
import { EditCard } from './EditCard';
import { useEditForm } from './edit-actions';
import { InheritedPolicyNote, PricingForm } from './PricingForm';
import styles from './EditPanes.module.css';

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
 * Mục "Giao nhận" (design `23721:31485`): giao xe tận nơi (bán kính + bảng phí theo km — thuộc chính
 * sách thuê của xe) · khung giờ giao / nhận xe · thời gian chết giữa hai chuyến.
 *
 * Hai form, hai endpoint, MỘT nút Lưu ở cột phải: giao xe đi cùng `PUT /vehicles/:id/pricing` (bộ
 * chính sách của xe), khung giờ + thời gian chết đi `PUT /vehicles/:id/operation-settings`. Server
 * enforce khung giờ lúc khách gửi yêu cầu; thời gian chết vào `vehicle_occupancies.buffer_minutes`
 * của lịch giữ MỚI (ADR 0006) — màn hình nói rõ phạm vi đó.
 *
 * Phiên hỗ trợ (ADR 0050 §13): giao xe có phí là khu TIỀN — không dựng; khung giờ theo capability.
 */
export function HandoverPane({
  vehicle,
  canEdit,
  canEditPricing,
  onOpenServices,
}: {
  vehicle: VehicleDetail;
  /** Sửa khung giờ / thời gian chết — `vehicles.update` ∧ capability vận hành của phiên hỗ trợ. */
  canEdit: boolean;
  canEditPricing: boolean;
  /** Mở mục "Dịch vụ xe" — nơi có công tắc chính sách gian hàng. */
  onOpenServices: () => void;
}) {
  const t = useTranslations('Vehicles.editor.handover');
  const support = useSupportSession();
  const { isManage } = useWorkspace();
  const pricingAllowed = supportAllowsVehicleTab(support, VEHICLE_EDIT_TAB.PRICING);

  return (
    <div className={styles.stack}>
      {pricingAllowed ? (
        <PricingForm vehicle={vehicle}>
          {(priced, pricingState) =>
            priced ? (
              <Form
                component={false}
                layout="vertical"
                colon={false}
                disabled={!canEditPricing || !priced.policyEditable}
              >
                <EditCard title={t('title')}>
                  {!priced.policyEditable && isManage ? (
                    <InheritedPolicyNote onOpenSwitch={onOpenServices} />
                  ) : null}
                  <DeliveryPolicySection
                    control={priced.api.form.control}
                    title={t('delivery')}
                    disabled={!canEditPricing || !priced.policyEditable}
                  />
                </EditCard>
              </Form>
            ) : (
              pricingState
            )
          }
        </PricingForm>
      ) : null}
      <HandoverWindows vehicleId={vehicle.id} canEdit={canEdit} />
    </div>
  );
}

function HandoverWindows({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const settings = useVehicleOperationSettings(vehicleId);

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
  return <WindowsForm settings={settings.data} canEdit={canEdit} vehicleId={vehicleId} />;
}

function WindowsForm({
  settings,
  canEdit,
  vehicleId,
}: {
  settings: VehicleOperationSettings;
  canEdit: boolean;
  vehicleId: string;
}) {
  const t = useTranslations('VehicleManage');
  const tEditor = useTranslations('Vehicles.editor.handover');
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

  function submit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (next) => {
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

  useEditForm('handover', {
    dirty: formState.isDirty,
    submitting: save.isPending,
    submit,
    reset: () => reset(values),
  });

  return (
    <Form component={false} layout="vertical" colon={false} disabled={!canEdit}>
      <EditCard title={tEditor('windowsTitle')} subtitle={t('handover.subtitle')}>
        <div className={styles.windowColumns}>
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
        </div>
        <p className={styles.toggleHint}>{t('handover.allDay')}</p>
      </EditCard>

      <EditCard title={t('handover.bufferTitle')} subtitle={t('handover.bufferHint')}>
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
        <Alert type="info" showIcon title={t('handover.scopeNote')} />
      </EditCard>
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
    <fieldset className={styles.windows}>
      <legend className={styles.subheading}>{title}</legend>
      {fields.map((field, index) => (
        <div key={field.id} className={styles.windowRow}>
          <SelectField
            control={control}
            name={`${name}.${index}.start`}
            label={`${t('from')} ${index + 1}`}
            hideLabel
            options={TIME_OPTIONS}
            disabled={disabled}
          />
          <span className={styles.windowDash} aria-hidden="true">
            –
          </span>
          <SelectField
            control={control}
            name={`${name}.${index}.end`}
            label={`${t('to')} ${index + 1}`}
            hideLabel
            options={TIME_OPTIONS}
            disabled={disabled}
          />
          <Button
            type="text"
            danger
            icon={<CloseOutlined aria-hidden="true" />}
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
        className={styles.addWindow}
      >
        {t('addWindow')}
      </Button>
      {fields.length >= HANDOVER_WINDOW_MAX_PER_KIND ? (
        <p className={styles.toggleHint}>
          {t('maxWindows', { max: HANDOVER_WINDOW_MAX_PER_KIND })}
        </p>
      ) : null}
    </fieldset>
  );
}
