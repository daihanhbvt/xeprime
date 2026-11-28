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
import { vehicleFormWithPhotosSchema, type VehicleFormValues } from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useFormRefresh, RESET_DISCARD } from '@/hooks/use-form-refresh';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useErrorMessage } from '@/i18n/use-error-message';
import { VehicleEditHeader } from './components/VehicleEditHeader';
import { VehicleEditHeaderCard } from './components/VehicleEditHeaderCard';
import { BodyTypePicker } from './components/VehicleFormSteps';
import {
  ConsumptionFields,
  DescriptionField,
  DimensionsFields,
  EngineOutputFields,
  FeaturesOnlyFields,
  VehicleEnergyCardFields,
  VehicleGeneralFields,
  VehicleIdentityCardFields,
} from './components/VehicleInfoFormSections';
import { informationValuesToInput, vehicleToFormValues } from './mappers';
import { useUpdateVehicle, useVehicle } from './hooks/use-vehicle';
import { useVehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { branchLabel, type VehicleDetail } from './api';

/**
 * Trường của mục "Thông tin xe & tiện ích" — khớp `INFORMATION_FIELDS` của `VehicleEditWorkspace`
 * bên web (30/09/2026). KHÔNG có `serviceTypes` (công tắc dịch vụ lưu ngay) và `operationStatus`
 * (sửa tại chỗ trên thẻ đầu xe); CÓ `features`/`description` (dời sang mục này).
 */
/** Trường của khối "Thông số nâng cao" (thu gọn được). */
const ADVANCED_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'horsepowerHp',
  'fuelConsumptionCity',
  'fuelConsumptionHighway',
];

/** Khe trong thẻ - Figma `num/12` (giữa tiêu đề và các ô, giữa các ô). */
const INNER_GAP = space.sm + space.xs;

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
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']} scroll={false}>
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
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']} scroll={false}>
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
  const colors = useColors();
  const t = useTranslations('Vehicles.edit');
  const tInfo = useTranslations('Vehicles.editor.information');
  // Figma: "Tiện ích xe" mở sẵn (mũi tên lên), "Thông số nâng cao" (không có trong Figma) đóng sẵn.
  const [featuresCollapsed, setFeaturesCollapsed] = useState(false);
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true);
  const bodyTypeCarousel = useMemo(
    () => ({ prevLabel: tInfo('bodyTypePrev'), nextLabel: tInfo('bodyTypeNext') }),
    [tInfo],
  );
  const tActions = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const toast = useAppToast();
  // Lỗi dịch theo MÃ (ADR 0012) — không hiện nguyên câu server.
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const update = useUpdateVehicle(vehicle.id);
  // Nhãn nguồn xe ở thẻ đầu — chỉ khi có năng lực nguồn xe (web `showSource={isManage && can.source}`).
  const can = useVehicleCapabilities();

  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormWithPhotosSchema,
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
  // Lỗi nằm trong khối đang thu gọn ⇒ mở khối đó, không để người dùng tìm lỗi không thấy.
  const advancedError = ADVANCED_FIELDS.some((field) => errors[field]);
  const featuresError = Boolean(errors.features);
  useEffect(() => {
    if (advancedError) setAdvancedCollapsed(false);
  }, [advancedError]);
  useEffect(() => {
    if (featuresError) setFeaturesCollapsed(false);
  }, [featuresError]);

  /** Mở mục Hình ảnh từ thẻ đầu xe — qua cùng câu hỏi "bỏ thay đổi?" như mọi lối rời màn. */
  const openImages = () =>
    leave.guard(() =>
      navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.MEDIA)),
    );

  async function save() {
    const valid = await trigger([...INFORMATION_FIELDS]);
    if (!valid) return;
    try {
      const updated = await update.mutateAsync(informationValuesToInput(getValues()));
      reset(vehicleToFormValues(updated), RESET_DISCARD);
      toast.showSuccess(t('saved.information'));
    } catch (error) {
      // Lỗi validate của SERVER đặt ĐÚNG Ô nó nói tới; còn lại một toast.
      const applied = applyApiFieldErrors(error, setError, { fields: INFORMATION_FIELDS });
      if (applied.length === 0) toast.showError(errorMessage(error));
    }
  }

  return (
    <>
      {/* Figma "Chỉnh sửa xe" MB: ← + % hoàn thiện + dải tab gạch chân; đổi tab hỏi "bỏ thay đổi?" như nút Lui. */}
      <VehicleEditHeader
        vehicleId={vehicle.id}
        tab={VEHICLE_EDIT_TAB.INFORMATION}
        title={t('title')}
        guard={leave.guard}
        onBack={onBack}
      />
      <Screen
        scrollReveal={false}
        motion={false}
        edges={['left', 'right', 'bottom']}
        {...refresh}
        footer={
          canUpdate ? (
            <XStack gap={space.sm}>
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                <Button
                  label={isDirty ? t('revert') : tActions('cancel')}
                  variant="outline"
                  onPress={() => (isDirty ? reset(initialValues, RESET_DISCARD) : onBack())}
                />
              </YStack>
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                <Button
                  variant="gradient"
                  label={tActions('saveChanges')}
                  lineIcon="tick"
                  loading={update.isPending}
                  disabled={!isDirty}
                  onPress={() => void save()}
                />
              </YStack>
            </XStack>
          ) : undefined
        }
      >
        <YStack gap={space.md}>
          {/* Trạng thái vận hành sửa TẠI CHỖ (lưu ngay) — cần `vehicles.update`. */}
          <VehicleEditHeaderCard
            vehicle={vehicle}
            onEditImages={openImages}
            statusEditable={canUpdate}
            showSource={can.source}
            compact
          />

          {activeErrors > 0 ? (
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('errors', { count: activeErrors })}
            </Text>
          ) : null}

          {/*
            Figma "Chỉnh sửa xe" MB (`24228:103820`): thẻ trắng viền, đệm 16, khe trong 12, tiêu đề
            chỉ chữ. Thứ tự: Thông tin chung · Kiểu dáng xe (ô tô) · Động cơ & nhiên liệu · Tiện ích
            xe (thu gọn được). Figma không vẽ "Thông số nâng cao" và "Mô tả xe" - người dùng chốt
            27/11/2026 giữ cả hai cùng khuôn thẻ (nâng cao thu gọn, mặc định đóng) và bỏ thẻ "Thông
            tin tóm tắt" (thẻ đầu xe đã có trạng thái, giá, số KM).
          */}
          <Card lift="flat">
            <YStack gap={INNER_GAP}>
              <SectionHeader>{tInfo('general')}</SectionHeader>
              <VehicleGeneralFields
                control={control}
                branchOptions={branchOptions}
                branchLoading={branches.isPending}
                branchDisabled={!canUpdate}
                lockedNotice={lockedNotice}
              />
              <VehicleIdentityCardFields
                control={control}
                isCar={isCar}
                lockedNotice={lockedNotice}
                setValue={setValue}
                bodyTypeElsewhere
              />
            </YStack>
          </Card>
          {isCar ? (
            <Card lift="flat">
              <YStack gap={INNER_GAP}>
                <SectionHeader
                  action={
                    <Text col={colors.textDisabled} fos={fontSize.bodySm}>
                      {tInfo('bodyTypeSwipe')}
                    </Text>
                  }
                >
                  {tInfo('bodyType')}
                </SectionHeader>
                <BodyTypePicker control={control} carousel={bodyTypeCarousel} />
              </YStack>
            </Card>
          ) : null}
          <Card lift="flat">
            <YStack gap={INNER_GAP}>
              <SectionHeader>{tInfo('energy')}</SectionHeader>
              <VehicleEnergyCardFields
                control={control}
                isCar={isCar}
                lockedNotice={lockedNotice}
                setValue={setValue}
              />
            </YStack>
          </Card>
          <Card lift="flat">
            <YStack gap={INNER_GAP}>
              <SectionHeader
                collapsed={featuresCollapsed}
                onToggleCollapsed={() => setFeaturesCollapsed((v) => !v)}
              >
                {tInfo('features')}
              </SectionHeader>
              {featuresCollapsed ? null : <FeaturesOnlyFields control={control} isCar={isCar} />}
            </YStack>
          </Card>
          <Card lift="flat">
            <YStack gap={INNER_GAP}>
              <SectionHeader
                collapsed={advancedCollapsed}
                onToggleCollapsed={() => setAdvancedCollapsed((v) => !v)}
                lead={advancedCollapsed ? undefined : tInfo('advancedHint')}
              >
                {tInfo('advanced')}
              </SectionHeader>
              {advancedCollapsed ? null : (
                <>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {tInfo('dimensions')}
                  </Text>
                  <DimensionsFields control={control} />
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {tInfo('engine')}
                  </Text>
                  <EngineOutputFields control={control} />
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {tInfo('consumption')}
                  </Text>
                  <ConsumptionFields control={control} />
                </>
              )}
            </YStack>
          </Card>
          <Card lift="flat">
            <YStack gap={INNER_GAP}>
              <SectionHeader>{tInfo('description')}</SectionHeader>
              <DescriptionField control={control} label={tInfo('description')} />
            </YStack>
          </Card>
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
          reset(initialValues, RESET_DISCARD);
          leave.confirm();
        }}
        onCancel={leave.cancel}
      />
    </>
  );
}
