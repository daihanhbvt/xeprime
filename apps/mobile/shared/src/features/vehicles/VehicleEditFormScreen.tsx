import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useFormRefresh } from '@/hooks/use-form-refresh';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useErrorMessage } from '@/i18n/use-error-message';
import { VehicleEditHeaderCard } from './components/VehicleEditHeaderCard';
import { VehicleInfoSummaryCard } from './components/VehicleInfoSummaryCard';
import {
  ConsumptionFields,
  DimensionsFields,
  EngineOutputFields,
  FeaturesDescriptionFields,
  PaneTab,
  VehicleEnergyCardFields,
  VehicleGeneralFields,
  VehicleIdentityCardFields,
  VehicleServiceChips,
} from './components/VehicleInfoFormSections';
import { informationValuesToInput, vehicleToFormValues } from './mappers';
import { useUpdateVehicle, useVehicle } from './hooks/use-vehicle';
import { branchLabel, type VehicleDetail } from './api';

/**
 * Trường của mục "Thông tin xe & tiện ích" — khớp `INFORMATION_FIELDS` của `VehicleEditWorkspace`
 * bên web (30/09/2026). KHÔNG có `serviceTypes` (công tắc dịch vụ lưu ngay) và `operationStatus`
 * (sửa tại chỗ trên thẻ đầu xe); CÓ `features`/`description` (dời sang mục này).
 */
export const INFORMATION_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'name',
  'branchId',
  'vehicleType',
  'plateNumber',
  'brand',
  'model',
  'bodyType',
  'manufactureYear',
  'seatCount',
  'fuelType',
  'color',
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'engineDisplacementCc',
  'horsepowerHp',
  'transmission',
  'fuelConsumptionCity',
  'fuelConsumptionHighway',
  'fuelConsumptionCombined',
  'features',
  'description',
];

/**
 * Trường có ô ở tab "Thông số kỹ thuật nâng cao" — nhóm `specs` của web trừ
 * `fuelConsumptionCombined` (ô đó ở khối năng lượng, tab cơ bản).
 */
const ADVANCED_ONLY: ReadonlySet<string> = new Set([
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'horsepowerHp',
  'fuelConsumptionCity',
  'fuelConsumptionHighway',
]);

const INFO_PANE = { BASIC: 'basic', ADVANCED: 'advanced' } as const;
type InfoPane = (typeof INFO_PANE)[keyof typeof INFO_PANE];

/**
 * Mục "Thông tin xe & tiện ích" của màn sửa xe (cổng quản lý) — bản native của tab Thông tin
 * trong `VehicleEditWorkspace` bên web.
 *
 * Thẻ đầu xe (ảnh · trạng thái vận hành sửa tại chỗ) → hai tab ngang Cơ bản / Nâng cao trên CÙNG
 * một form, MỘT nút Lưu → khối tóm tắt chỉ đọc. Dịch vụ lưu ngay bằng nhãn bấm, không qua nút Lưu.
 *
 * Xe đã DUYỆT: năm trường căn cước bị khoá (`VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS`), server chặn
 * lại bằng 409 `VEHICLE_FIELD_LOCKED` — ở đây chỉ là lớp trải nghiệm.
 */
export function VehicleEditFormScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canUpdate = has(PERMISSION.VEHICLE_UPDATE);
  const tPage = useTranslations('Vehicles.edit.page');
  const tPermission = useTranslations('ManageCommon.permission');

  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  // Không gọi API khi chưa có quyền sửa: tránh một request chắc chắn bị guard backend từ chối.
  const query = useVehicle(vehicleId, canUpdate);
  const title = t('tabs.information');

  if (!permissionsLoading && !canUpdate) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tPage('forbiddenTitle')}
            description={`${tPage('forbiddenBody')}
${tPermission('requires')} ${PERMISSION.VEHICLE_UPDATE}`}
            actionLabel={tPage('viewDetail')}
            onAction={() => router.replace(ROUTES.manage.vehicleDetail(vehicleId))}
          />
        </Screen>
      </>
    );
  }

  if (query.isPending) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={query.error} title={title} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <EditForm
      vehicle={query.data}
      title={title}
      canUpdate={canUpdate}
      onBack={back}
      refreshing={query.isRefetching}
      onRefetch={() => void query.refetch()}
    />
  );
}

function EditForm({
  vehicle,
  title,
  canUpdate,
  onBack,
  refreshing,
  onRefetch,
}: {
  vehicle: VehicleDetail;
  title: string;
  canUpdate: boolean;
  onBack: () => void;
  refreshing: boolean;
  onRefetch: () => void;
}) {
  const t = useTranslations('Vehicles.edit');
  const tAdvanced = useTranslations('Vehicles.form.advanced');
  const tActions = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const toast = useAppToast();
  // Lỗi dịch theo MÃ (ADR 0012) — không hiện nguyên câu server.
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const update = useUpdateVehicle(vehicle.id);
  const [pane, setPane] = useState<InfoPane>(INFO_PANE.BASIC);

  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormSchema,
    'Vehicles.form.validation',
  );
  const applyApiFieldErrors = useApiFieldErrors();

  const {
    control,
    getValues,
    reset,
    setError,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver,
    /*
     * `values` + `keepDirtyValues`: form TỰ ĐỒNG BỘ khi dữ liệu server đổi (kéo-làm-mới, đổi
     * trạng thái/dịch vụ trên chính màn này) nhưng KHÔNG đè ô người dùng đang gõ dở.
     */
    values: initialValues,
    resetOptions: { keepDirtyValues: true },
  });

  const leave = useLeaveGuard(isDirty);
  const refresh = useFormRefresh(isDirty, refreshing, onRefetch);

  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;

  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, isCar, setValue, vehicleType]);

  /**
   * Chi nhánh: chỉ chi nhánh ĐANG HOẠT ĐỘNG, nhưng BỔ SUNG chi nhánh hiện tại của xe nếu nó vừa
   * bị ngừng — thiếu bước này ô chi nhánh trống và người dùng tưởng xe mất vị trí.
   */
  const branches = useActiveBranches(true);
  const noProvince = tBranches('labels.noProvince');
  const branchOptions = useMemo(() => {
    const options = (branches.data?.items ?? []).map((b) => ({
      value: b.id,
      label: branchLabel(b, noProvince),
    }));
    const current = vehicle.branch;
    if (current && !options.some((o) => o.value === current.id)) {
      options.unshift({
        value: current.id,
        label: t('branchInactive', { label: branchLabel(current, noProvince) }),
      });
    }
    return options;
  }, [branches.data, noProvince, t, vehicle.branch]);

  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const lockedNotice = isPublic ? t('lockedField') : undefined;
  const activeErrors = INFORMATION_FIELDS.filter((field) => errors[field]).length;
  const advancedErrors = INFORMATION_FIELDS.filter(
    (field) => errors[field] && ADVANCED_ONLY.has(field),
  ).length;
  const basicErrors = activeErrors - advancedErrors;

  /** Mở mục Hình ảnh từ thẻ đầu xe — qua cùng câu hỏi "bỏ thay đổi?" như mọi lối rời màn. */
  const openImages = () =>
    leave.guard(() =>
      navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.MEDIA)),
    );

  async function save() {
    const valid = await trigger([...INFORMATION_FIELDS]);
    if (!valid) {
      // Lỗi CHỈ nằm ở tab nâng cao ⇒ mở tab đó; còn lại về tab cơ bản (web `revealErrors`).
      const invalid = INFORMATION_FIELDS.filter((field) => getFieldError(field));
      setPane(
        invalid.length > 0 && invalid.every((field) => ADVANCED_ONLY.has(field))
          ? INFO_PANE.ADVANCED
          : INFO_PANE.BASIC,
      );
      return;
    }
    try {
      const updated = await update.mutateAsync(informationValuesToInput(getValues()));
      reset(vehicleToFormValues(updated));
      toast.showSuccess(t('saved.information'));
    } catch (error) {
      // Lỗi validate của SERVER đặt ĐÚNG Ô nó nói tới; còn lại một toast.
      const applied = applyApiFieldErrors(error, setError, { fields: INFORMATION_FIELDS });
      if (applied.length === 0) toast.showError(errorMessage(error));
    }
  }

  // `trigger` đã cập nhật `errors` khi nó resolve — đọc qua `control` để lấy bản mới nhất.
  function getFieldError(field: keyof VehicleFormValues) {
    return control.getFieldState(field).error;
  }

  return (
    <>
      <AppHeader
        title={title}
        subtitle={[vehicle.name, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
        onBack={() => leave.guard(onBack)}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        {...refresh}
        footer={
          canUpdate ? (
            <XStack gap={space.sm}>
              <YStack f={1}>
                <Button
                  label={isDirty ? t('revert') : tActions('cancel')}
                  variant="secondary"
                  onPress={() => (isDirty ? reset(initialValues) : onBack())}
                />
              </YStack>
              <YStack f={1}>
                <Button
                  label={tActions('saveChanges')}
                  icon="save-outline"
                  loading={update.isPending}
                  disabled={!isDirty}
                  onPress={() => void save()}
                />
              </YStack>
            </XStack>
          ) : undefined
        }
      >
        <YStack gap={layout.section}>
          {/* Trạng thái vận hành sửa TẠI CHỖ (lưu ngay) — cần `vehicles.update`. */}
          <VehicleEditHeaderCard
            vehicle={vehicle}
            onEditImages={openImages}
            statusEditable={canUpdate}
          />

          {activeErrors > 0 ? (
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('errors', { count: activeErrors })}
            </Text>
          ) : null}

          <XStack gap={space.xs} accessibilityRole="tablist">
            <PaneTab
              label={t('infoTabs.basic')}
              errors={basicErrors}
              selected={pane === INFO_PANE.BASIC}
              onPress={() => setPane(INFO_PANE.BASIC)}
            />
            <PaneTab
              label={t('infoTabs.advanced')}
              errors={advancedErrors}
              selected={pane === INFO_PANE.ADVANCED}
              onPress={() => setPane(INFO_PANE.ADVANCED)}
            />
          </XStack>

          {pane === INFO_PANE.BASIC ? (
            <>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{t('cards.general')}</BlockTitle>
                  <VehicleGeneralFields
                    control={control}
                    branchOptions={branchOptions}
                    branchLoading={branches.isPending}
                    branchDisabled={!canUpdate}
                  />
                  {/* Loại dịch vụ: nhãn bấm là lưu ngay — cùng đường ghi với công tắc trên mục lục. */}
                  <VehicleServiceChips vehicle={vehicle} canEdit={canUpdate} />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{t('cards.identity')}</BlockTitle>
                  <VehicleIdentityCardFields
                    control={control}
                    isCar={isCar}
                    lockedNotice={lockedNotice}
                    setValue={setValue}
                  />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{t('cards.energy')}</BlockTitle>
                  <VehicleEnergyCardFields
                    control={control}
                    isCar={isCar}
                    lockedNotice={lockedNotice}
                    setValue={setValue}
                  />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{t('cards.featuresDescription')}</BlockTitle>
                  <FeaturesDescriptionFields control={control} isCar={isCar} />
                </YStack>
              </Card>
            </>
          ) : (
            <>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('advanced.hint')}
              </Text>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{tAdvanced('dimensionsTitle')}</BlockTitle>
                  <DimensionsFields control={control} />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{tAdvanced('engineTitle')}</BlockTitle>
                  <EngineOutputFields control={control} />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.md}>
                  <BlockTitle>{tAdvanced('consumptionTitle')}</BlockTitle>
                  <ConsumptionFields control={control} />
                </YStack>
              </Card>
            </>
          )}

          <VehicleInfoSummaryCard vehicle={vehicle} />
        </YStack>
      </Screen>

      <AlertDialog
        open={leave.open}
        title={t('discard.title')}
        message={t('discard.body')}
        confirmLabel={t('discard.ok')}
        cancelLabel={t('discard.cancel')}
        destructive
        onConfirm={() => {
          reset(initialValues);
          leave.confirm();
        }}
        onCancel={leave.cancel}
      />
    </>
  );
}
