import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useFieldArray, useForm, useFormState, useWatch, type Control } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  HANDOVER_WINDOW_MAX_PER_KIND,
  TURNAROUND_BUFFER_MAX_MINUTES,
  TURNAROUND_BUFFER_PRESET_MINUTES,
  handoverTimeToMinute,
  minuteToHandoverTime,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { InlineAction } from '@/components/ui/InlineAction';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import { VehicleManageShell } from './components/VehicleManageShell';
import type { VehicleOperationSettings } from './api';
import {
  useSaveVehicleOperationSettings,
  useVehicleOperationSettings,
} from './hooks/use-vehicle-settings';

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
 * Mục "Thời gian giao nhận": khung giờ giao / nhận trong ngày + thời gian chết giữa hai chuyến.
 * Bản native của `HandoverTimeSection`.
 *
 * Server enforce khung giờ lúc khách gửi yêu cầu; thời gian chết đi vào
 * `vehicle_occupancies.buffer_minutes` của lịch giữ MỚI (ADR 0006) — màn hình nói rõ phạm vi đó
 * thay vì để người dùng tưởng nó tính lại cho đơn đang có.
 */
export function VehicleHandoverTimeScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('VehicleManage');

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME}
      title={t('handover.title')}
      subtitle={t('handover.subtitle')}
    >
      {({ canEdit }) => <HandoverBody vehicleId={vehicleId} canEdit={canEdit} />}
    </VehicleManageShell>
  );
}

function HandoverBody({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const t = useTranslations('VehicleManage');
  const settings = useVehicleOperationSettings(vehicleId);

  if (settings.isLoading) return <MiniRowsSkeleton rows={6} />;
  if (settings.isError || !settings.data) {
    return (
      <ScreenError
        error={settings.error}
        title={t('common.loadError')}
        onRetry={() => void settings.refetch()}
      />
    );
  }
  return <HandoverForm settings={settings.data} vehicleId={vehicleId} canEdit={canEdit} />;
}

function HandoverForm({
  settings,
  vehicleId,
  canEdit,
}: {
  settings: VehicleOperationSettings;
  vehicleId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
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

  const submit = handleSubmit((next) => {
    save.mutate(
      {
        pickupWindows: next.pickupWindows,
        returnWindows: next.returnWindows,
        turnaroundBufferMinutes: next.turnaroundBufferMinutes,
      },
      {
        onSuccess: (saved) => {
          // Reset theo bản SERVER trả về: nó chuẩn hoá và gộp mốc, nên form phải theo nó chứ
          // không theo thứ người dùng vừa gõ — nếu không, nút Lưu còn sáng sau một lần lưu thành công.
          reset({
            pickupWindows: saved.pickupWindows,
            returnWindows: saved.returnWindows,
            turnaroundBufferMinutes: saved.turnaroundBufferMinutes,
          });
          toast.showSuccess(t('handover.saved'));
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
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
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('handover.allDay')}
          </Text>
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('handover.bufferTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('handover.bufferHint')}
          </Text>
          <XStack gap={space.xs} flexWrap="wrap">
            {TURNAROUND_BUFFER_PRESET_MINUTES.map((minutes) => (
              <Chip
                key={minutes}
                label={
                  minutes === 0
                    ? t('handover.bufferNone')
                    : t('common.hours', { count: minutes / 60 })
                }
                selected={isPreset && buffer === minutes}
                {...(canEdit
                  ? {
                      onPress: () =>
                        setValue('turnaroundBufferMinutes', minutes, {
                          shouldDirty: true,
                          shouldValidate: true,
                        }),
                    }
                  : {})}
              />
            ))}
            <Chip
              label={t('handover.bufferCustom')}
              selected={!isPreset}
              {...(canEdit
                ? {
                    onPress: () =>
                      setValue('turnaroundBufferMinutes', 30, {
                        shouldDirty: true,
                        shouldValidate: true,
                      }),
                  }
                : {})}
            />
          </XStack>
          {!isPreset ? (
            <NumberField
              control={control}
              name="turnaroundBufferMinutes"
              label={t('handover.bufferCustomLabel')}
              min={0}
              max={TURNAROUND_BUFFER_MAX_MINUTES}
              editable={canEdit}
            />
          ) : null}
          <Callout tone="info">{t('handover.scopeNote')}</Callout>
        </YStack>
      </Card>

      {canEdit ? (
        <XStack gap={space.sm}>
          {formState.isDirty ? (
            <YStack flexShrink={0}>
              <Button
                label={tActions('cancel')}
                variant="ghost"
                disabled={save.isPending}
                onPress={() => reset(values)}
              />
            </YStack>
          ) : null}
          <YStack f={1}>
            <Button
              label={tActions('saveChanges')}
              icon="checkmark-outline"
              loading={save.isPending}
              disabled={!formState.isDirty}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      ) : null}
    </YStack>
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
  // Lỗi CHÉO của cả mảng (chồng lấn, quá số mốc) nằm ở root — lỗi từng ô do `SelectField` tự hiện.
  const error = errors[name] as { root?: { message?: string }; message?: string } | undefined;
  const crossMessage = error?.root?.message ?? error?.message;

  return (
    <YStack gap={space.sm}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {title}
      </Text>

      {fields.map((field, index) => (
        <XStack key={field.id} ai="flex-end" gap={space.xs}>
          <YStack f={1}>
            <SelectField
              control={control}
              name={`${name}.${index}.start`}
              label={t('from')}
              options={TIME_OPTIONS}
              disabled={disabled}
            />
          </YStack>
          <YStack f={1}>
            <SelectField
              control={control}
              name={`${name}.${index}.end`}
              label={t('to')}
              options={TIME_OPTIONS}
              disabled={disabled}
            />
          </YStack>
          <Pressable
            onPress={() => remove(index)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('removeWindow', { index: index + 1 })}
            hitSlop={space.xs}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
          >
            <YStack w={sizing.touchTarget} h={sizing.touchTarget} ai="center" jc="center">
              <Ionicons
                name="trash-outline"
                size={iconSize.md}
                color={disabled ? colors.textDisabled : colors.danger}
              />
            </YStack>
          </Pressable>
        </XStack>
      ))}

      {crossMessage ? (
        <Text col={colors.danger} fos={fontSize.label} accessibilityRole="alert">
          {crossMessage}
        </Text>
      ) : null}

      {!disabled && fields.length < HANDOVER_WINDOW_MAX_PER_KIND ? (
        <InlineAction label={t('addWindow')} onPress={() => append({ start: '06:00', end: '22:00' })} />
      ) : null}
      {fields.length >= HANDOVER_WINDOW_MAX_PER_KIND ? (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('maxWindows', { max: HANDOVER_WINDOW_MAX_PER_KIND })}
        </Text>
      ) : null}
    </YStack>
  );
}
