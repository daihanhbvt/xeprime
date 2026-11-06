import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { TURNAROUND_BUFFER_MAX_MINUTES, TURNAROUND_BUFFER_PRESET_MINUTES } from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { NumberField } from '@/components/ui/NumberField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { VehicleManageShell, type VehicleSectionWorkspace } from './components/VehicleManageShell';
import type { VehicleOperationSettings } from './api';
import {
  useSaveVehicleOperationSettings,
  useVehicleOperationSettings,
} from './hooks/use-vehicle-settings';

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
 * Mục "Thời gian chết giữa hai chuyến" của nhóm Chính sách thuê — bản native của `TurnaroundCard` web.
 * Khung giờ giao/nhận đã gỡ (ADR 0078): xe nhận và trả mọi giờ. Tên file/route giữ `handover-time`
 * cho link cũ.
 *
 * Thời gian chết đi vào `vehicle_occupancies.buffer_minutes` của lịch giữ MỚI (ADR 0006) — màn hình
 * nói rõ phạm vi đó thay vì để người dùng tưởng nó tính lại cho đơn đang có. Áp cho CẢ chiếc xe,
 * không khoá theo dịch vụ nào.
 */
export function VehicleHandoverTimeScreen({
  vehicleId,
  workspace,
}: {
  vehicleId: string;
  /** `manage` = mục của màn sửa xe ở app Partner (Lui về hub sửa xe) — xem `VehicleManageShell`. */
  workspace?: VehicleSectionWorkspace;
}) {
  const t = useTranslations('VehicleManage');

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      {...(workspace ? { workspace } : {})}
      section={VEHICLE_MANAGE_SECTION.HANDOVER_TIME}
      subtitle={t('handover.subtitle')}
    >
      {({ canEdit }) => <HandoverBody vehicleId={vehicleId} canEdit={canEdit} />}
    </VehicleManageShell>
  );
}

export function HandoverBody({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
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
  const colors = useColors();
  const t = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const save = useSaveVehicleOperationSettings(vehicleId);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.handover.validation');

  const values = useMemo<FormValues>(
    () => ({
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
        turnaroundBufferMinutes: next.turnaroundBufferMinutes,
      },
      {
        onSuccess: (saved) => {
          // Reset theo bản SERVER trả về: nó chuẩn hoá và gộp mốc, nên form phải theo nó chứ
          // không theo thứ người dùng vừa gõ — nếu không, nút Lưu còn sáng sau một lần lưu thành công.
          reset({
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
      {/* Khung giờ giao/nhận đã gỡ (ADR 0078) — xe nhận và trả mọi giờ; chỉ còn thời gian chuẩn bị. */}
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
              required
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

