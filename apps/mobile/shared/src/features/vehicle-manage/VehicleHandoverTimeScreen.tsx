import { useRegisterSave, useReportDirty, type SubFormSave } from '@/hooks/use-report-dirty';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { TURNAROUND_BUFFER_MAX_MINUTES } from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { TurnaroundBufferField } from '@/features/rental-policies/components/TurnaroundBufferField';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { space } from '@/theme/tokens';
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
  useShopDefault: yup.boolean().defined(),
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

export function HandoverBody({
  vehicleId,
  canEdit,
  onDirtyChange,
  registerSave,
}: {
  vehicleId: string;
  canEdit: boolean;
  /** Báo "đang sửa dở" lên màn chứa (`useReportDirty`). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Màn chứa có MỘT nút Lưu chung - form này ẩn nút riêng (`useRegisterSave`). */
  registerSave?: (save: SubFormSave | null) => void;
}) {
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
  return (
    <HandoverForm
      settings={settings.data}
      vehicleId={vehicleId}
      canEdit={canEdit}
      onDirtyChange={onDirtyChange}
      registerSave={registerSave}
    />
  );
}

function HandoverForm({
  settings,
  vehicleId,
  canEdit,
  onDirtyChange,
  registerSave,
}: {
  settings: VehicleOperationSettings;
  vehicleId: string;
  canEdit: boolean;
  onDirtyChange?: ((dirty: boolean) => void) | undefined;
  registerSave?: ((save: SubFormSave | null) => void) | undefined;
}) {
  const t = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const save = useSaveVehicleOperationSettings(vehicleId);
  const resolver = useValidationResolver<FormValues>(schema, 'VehicleManage.handover.validation');
  /*
   * "Theo gian hàng" chỉ có ở gian hàng (web `isManage`): chủ xe tuyến hoa hồng không có màn chính
   * sách gian hàng, nên mặc định của họ luôn trống (0) — lưu ở đó luôn là số riêng của xe.
   */
  const { data: user } = useCurrentUser();
  // Chỉ tuyến GÓI có mặc định gian hàng (web `isManage`) — `unconfigured`/chưa rõ tuyến không phải gian hàng.
  const isShop = resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE;

  const values = useMemo<FormValues>(
    () => ({
      turnaroundBufferMinutes: settings.turnaroundBufferMinutes,
      useShopDefault: isShop && settings.useShopDefault,
    }),
    [settings, isShop],
  );
  const { control, handleSubmit, reset, formState, setValue } = useForm<FormValues>({
    resolver,
    values,
  });
  useReportDirty(formState.isDirty, onDirtyChange);
  const useShopDefault = useWatch({ control, name: 'useShopDefault' });
  const shopMinutes = settings.shopDefaultMinutes ?? 0;
  const formatBuffer = (minutes: number): string =>
    minutes === 0
      ? t('handover.bufferNone')
      : minutes % 60 === 0
        ? t('common.hours', { count: minutes / 60 })
        : t('common.minutes', { count: minutes });

  const persist = async (next: FormValues, silent = false): Promise<boolean> => {
    try {
      const saved = await save.mutateAsync({
        turnaroundBufferMinutes: next.turnaroundBufferMinutes,
        useShopDefault: next.useShopDefault,
      });
      // Reset theo bản SERVER trả về: nó chuẩn hoá và gộp mốc, nên form phải theo nó chứ
      // không theo thứ người dùng vừa gõ — nếu không, nút Lưu còn sáng sau một lần lưu thành công.
      reset({
        turnaroundBufferMinutes: saved.turnaroundBufferMinutes,
        useShopDefault: isShop && saved.useShopDefault,
      });
      if (!silent) toast.showSuccess(t('handover.saved'));
      return true;
    } catch (err) {
      toast.showError(errorMessage(err));
      return false;
    }
  };
  const submit = handleSubmit(async (next) => {
    await persist(next);
  });
  useRegisterSave(async () => {
    if (!formState.isDirty) return true;
    let ok = false;
    await handleSubmit(async (next) => {
      ok = await persist(next, true);
    })();
    return ok;
  }, registerSave);

  return (
    <YStack gap={space.md}>
      {/* Khung giờ giao/nhận đã gỡ (ADR 0078) — xe nhận và trả mọi giờ; chỉ còn thời gian chuẩn bị. */}
      <Card>
        <YStack gap={space.sm}>
          <SectionHeader icon="time-outline" lead={t('handover.bufferHint')}>
            {t('handover.bufferTitle')}
          </SectionHeader>
          <TurnaroundBufferField
            control={control}
            name="turnaroundBufferMinutes"
            label={t('handover.bufferTitle')}
            disabled={!canEdit}
            {...(isShop
              ? {
                  inherit: {
                    active: useShopDefault,
                    label: t('handover.bufferShop', { value: formatBuffer(shopMinutes) }),
                    onChange: (active: boolean) => {
                      setValue('useShopDefault', active, { shouldDirty: true });
                      // Rời "theo gian hàng" bắt đầu từ chính số đang áp — không nhảy về 0.
                      if (!active && useShopDefault) {
                        setValue('turnaroundBufferMinutes', shopMinutes, { shouldDirty: true });
                      }
                    },
                  },
                }
              : {})}
          />
        </YStack>
      </Card>

      {canEdit && !registerSave ? (
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
