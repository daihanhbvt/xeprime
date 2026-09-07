import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, VEHICLE_PUBLIC_STATUS, VEHICLE_TYPE, isVehicleFuelTypeAllowed } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { VehicleEditTabs } from './components/VehicleEditTabs';
import { Button } from '@/components/ui/Button';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useFormRefresh } from '@/hooks/use-form-refresh';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  AdvancedSpecsSection,
  BasicStep,
  MediaStep,
  Notice,
  SpecsSection,
  StatusSection,
} from './components/VehicleFormSteps';
import { informationValuesToInput, mediaValuesToInput, vehicleToFormValues } from './mappers';
import { sensitiveChanges } from './sensitive-changes';
import { useUpdateVehicle, useVehicle } from './hooks/use-vehicle';
import { branchLabel, branchesApi, type UpdateVehicleInput, type VehicleDetail } from './api';

/** Hai màn con của hub sửa xe dùng chung khung này — khác nhau ở PAYLOAD và ở khối hiển thị. */
export type VehicleEditFormTab =
  | typeof VEHICLE_EDIT_TAB.INFORMATION
  | typeof VEHICLE_EDIT_TAB.MEDIA;

/**
 * Trường thuộc từng màn — dùng để validate RIÊNG màn đang mở và để đếm lỗi.
 *
 * Khớp `INFORMATION_FIELDS` / `MEDIA_FIELDS` của `VehicleEditWorkspace` bên web. Chi nhánh nằm ở
 * màn Thông tin nên phải được validate cùng các trường khác — thiếu nó thì lưu với chi nhánh
 * rỗng mà không có báo lỗi nào.
 */
const FIELDS: Record<VehicleEditFormTab, ReadonlyArray<keyof VehicleFormValues>> = {
  [VEHICLE_EDIT_TAB.INFORMATION]: [
    'name',
    'branchId',
    'vehicleType',
    'serviceTypes',
    'operationStatus',
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
  ],
  [VEHICLE_EDIT_TAB.MEDIA]: ['mainImageUrl', 'images', 'features', 'description'],
};

/**
 * Một màn của hub sửa xe (VEH-04): **Thông tin** hoặc **Hình ảnh**.
 *
 * Payload tách riêng theo màn — `informationValuesToInput` không mang media, `mediaValuesToInput`
 * không mang giá: hai màn ghi đè dữ liệu của nhau là cách chắc chắn để mất ảnh khi sửa biển số.
 *
 * Xe đang CÔNG KHAI mà đổi một trường nhạy cảm (giá, biển số, loại xe, dịch vụ, ảnh đại diện…)
 * sẽ bị đưa về chờ duyệt lại — hộp xác nhận liệt kê đúng những gì đổi, so bằng `sensitiveChanges`
 * (cùng công thức với `hasSensitiveChange` ở backend, nên FE và BE không bao giờ bất đồng).
 */
export function VehicleEditFormScreen({
  vehicleId,
  tab,
}: {
  vehicleId: string;
  tab: VehicleEditFormTab;
}) {
  const t = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canUpdate = has(PERMISSION.VEHICLE_UPDATE);

  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  // Không gọi API khi chưa có quyền sửa: tránh một request chắc chắn bị guard backend từ chối.
  const query = useVehicle(vehicleId, canUpdate);

  const title = tab === VEHICLE_EDIT_TAB.MEDIA ? t('tabs.media') : t('tabs.information');

  if (!permissionsLoading && !canUpdate) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={title} />
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
      tab={tab}
      title={title}
      onBack={back}
      refreshing={query.isRefetching}
      onRefetch={() => void query.refetch()}
    />
  );
}

function EditForm({
  vehicle,
  tab,
  title,
  onBack,
  refreshing,
  onRefetch,
}: {
  vehicle: VehicleDetail;
  tab: VehicleEditFormTab;
  title: string;
  onBack: () => void;
  refreshing: boolean;
  onRefetch: () => void;
}) {
  const t = useTranslations('Vehicles.edit');
  const tSensitive = useTranslations('Vehicles.publish.sensitive');
  const tActions = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const update = useUpdateVehicle(vehicle.id);

  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormSchema,
    'Vehicles.form.validation',
  );

  const {
    control,
    getValues,
    reset,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver,
    /*
     * `values` + `keepDirtyValues`: form TỰ ĐỒNG BỘ khi dữ liệu server đổi, nhưng KHÔNG đè lên
     * ô người dùng đang gõ dở.
     *
     * `defaultValues` chỉ được đọc một lần lúc gắn form. Dùng nó thì kéo-làm-mới gọi API xong,
     * dữ liệu mới về, mà các ô vẫn giữ nguyên giá trị cũ — người dùng thấy "làm mới không ăn"
     * trong khi web đã đổi. Đó là lý do màn này phải là `values`.
     *
     * `keepDirtyValues` là vế còn lại: không có nó, một lần refetch nền (quay lại app, invalidate
     * sau khi lưu ở màn khác) sẽ xoá trắng thứ đang gõ.
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
   * Chi nhánh: danh sách chỉ có chi nhánh ĐANG HOẠT ĐỘNG (không cho chuyển xe vào chi nhánh đã
   * ngừng), nhưng phải BỔ SUNG chi nhánh hiện tại của xe nếu nó vừa bị ngừng — thiếu bước này thì
   * mở form sửa sẽ thấy ô chi nhánh trống và người dùng tưởng xe mất vị trí.
   */
  const branches = useQuery({
    queryKey: queryKeys.branches.list({ status: 'active' }),
    queryFn: () => branchesApi.list('active'),
    enabled: tab === VEHICLE_EDIT_TAB.INFORMATION,
  });
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
  const activeFields = FIELDS[tab];
  const activeErrors = activeFields.filter((field) => errors[field]).length;
  const isMediaTab = tab === VEHICLE_EDIT_TAB.MEDIA;

  /** Gọi ở HAI chỗ (chặn lưu và liệt kê trong hộp xác nhận) — gói một lần thay vì truyền 5 tham số. */
  const changesOf = (values: VehicleFormValues) =>
    sensitiveChanges(initialValues, values, fmt, domainLabel, {
      field: (field) => tSensitive(`fields.${field}`),
      empty: tSensitive('empty'),
      imageSet: tSensitive('imageSet'),
      percent: (value) => tSensitive('percent', { value }),
    });

  async function save() {
    const valid = await trigger([...activeFields]);
    if (!valid) return;
    const values = getValues();
    if (isPublic && changesOf(values).length > 0) {
      setConfirmSensitive(true);
      return;
    }
    await submit(values);
  }

  async function submit(values: VehicleFormValues) {
    const body: UpdateVehicleInput = isMediaTab
      ? mediaValuesToInput(values)
      : informationValuesToInput(values);
    try {
      const updated = await update.mutateAsync(body);
      reset(vehicleToFormValues(updated));
      setConfirmSensitive(false);
      /*
        Câu báo KẾT QUẢ, không phải nhãn nút. Trước đây toast in ra `tActions('saveChanges')` —
        đúng chữ trên nút vừa bấm ("Lưu thay đổi"), nên nó không nói được là đã lưu xong hay chưa.
      */
      toast.showSuccess(t(isMediaTab ? 'saved.media' : 'saved.information'));
    } catch (error) {
      setConfirmSensitive(false);
      toast.showError(errorMessage(error));
    }
  }

  return (
    <>
      <AppHeader
        title={title}
        subtitle={[vehicle.name, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
        // Cùng một câu hỏi cho MỌI lối rời màn: nút Lui và dải tab (web cũng hỏi ở cả hai).
        onBack={() => leave.guard(onBack)}
      />
      <VehicleEditTabs vehicleId={vehicle.id} active={tab} guard={leave.guard} />
      <Screen
        edges={['left', 'right', 'bottom']}
        {...refresh}
        footer={
          <Button
            label={tActions('saveChanges')}
            loading={update.isPending}
            disabled={!isDirty}
            onPress={() => void save()}
          />
        }
      >
        <YStack gap={layout.section}>
          {activeErrors > 0 ? (
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('errors', { count: activeErrors })}
            </Text>
          ) : null}

          {/* `showIcon` như mọi `<Alert>` của web — xem `Notice`. */}
          {isPublic ? <Notice tone="warning" title={t('publicWarning')} /> : null}

          {!isMediaTab ? (
            <>
              {/*
                Bốn khối, ĐÚNG thứ tự `VehicleEditWorkspace` của web: cơ bản → quản lý trạng
                thái → thông số kỹ thuật → thông số nâng cao.

                KHÔNG có "Hình thức nguồn xe" ở đây. Web chỉ hỏi nó ở wizard TẠO xe; với một xe
                đã tồn tại, hồ sơ nguồn xe sống ở tab "Nguồn xe & tài chính" cùng hợp đồng và kỳ
                thanh toán — hỏi lại hình thức ở form thông tin là mở đường sửa thứ hai cho cùng
                một dữ liệu, và hai đường thì sớm muộn lệch nhau.
              */}
              <BasicStep
                control={control}
                branchOptions={branchOptions}
                branchLoading={branches.isPending}
                codeReadOnly
              />
              <Card>
                <YStack gap={space.sm}>
                  <BlockTitle>{t('cards.status')}</BlockTitle>
                  <StatusSection control={control} />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.sm}>
                  <BlockTitle>{t('cards.specs')}</BlockTitle>
                  <SpecsSection control={control} isCar={isCar} />
                </YStack>
              </Card>
              <Card>
                <YStack gap={space.sm}>
                  <BlockTitle>{t('advanced.title')}</BlockTitle>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('advanced.hint')}
                  </Text>
                  <AdvancedSpecsSection control={control} />
                </YStack>
              </Card>
            </>
          ) : (
            <MediaStep control={control} isCar={isCar} />
          )}
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

      <AlertDialog
        open={confirmSensitive}
        title={t('sensitive.title')}
        // Chỉ tính khi hộp thoại THẬT SỰ mở — mỗi thay đổi qua `fmt.money`/`domainLabel` cho cả
        // chục trường nhạy cảm, không đáng làm lại ở những render không liên quan (đổi loại xe,
        // mở hộp thoại bỏ thay đổi, branches refetch…).
        message={
          confirmSensitive
            ? [
                t('sensitive.body'),
                ...changesOf(getValues()).map(
                  (change) =>
                    `${t('sensitive.change', { label: change.label })} ${change.before} → ${change.after}`,
                ),
              ].join('\n')
            : ''
        }
        confirmLabel={t('sensitive.ok')}
        cancelLabel={tActions('cancel')}
        loading={update.isPending}
        onConfirm={() => void submit(getValues())}
        onCancel={() => setConfirmSensitive(false)}
      />
    </>
  );
}
