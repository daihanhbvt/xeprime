import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  BasicStep,
  MediaStep,
  SourceTypeSection,
  SpecsSection,
} from './components/VehicleFormSteps';
import { CreateVehiclePricingStep } from './components/CreateVehiclePricingStep';
import { VehicleWizardBar, type WizardStep } from './components/VehicleWizardBar';
import { VehicleCreateSuccess } from './components/VehicleCreateSuccess';
import { formValuesToInput } from './mappers';
import { useCreateVehicle } from './hooks/use-vehicle';
import { branchLabel, branchesApi, vehiclesApi, type VehicleDetail } from './api';

/** Mặc định khi tạo mới: chọn sẵn giá trị hợp lệ để các ô bắt buộc không rỗng. */
const EMPTY_DEFAULTS: VehicleFormValues = {
  code: '',
  name: '',
  // Điền ở runtime bằng chi nhánh MẶC ĐỊNH của gian hàng — một hằng không thể biết id đó.
  branchId: '',
  vehicleType: VEHICLE_TYPE.CAR,
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
  monthlyPrice: null,
  withDriverDailyPrice: null,
  withDriverInterCityPrice: null,
  withDriverOneWayPrice: null,
  sourceType: VEHICLE_SOURCE_TYPE.OWNED,
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  plateNumber: '',
  brand: '',
  model: '',
  color: '',
  fuelType: null,
  bodyType: null,
  manufactureYear: null,
  seatCount: null,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  curbWeightKg: null,
  engineDisplacementCc: null,
  horsepowerHp: null,
  transmission: null,
  fuelConsumptionCity: null,
  fuelConsumptionHighway: null,
  fuelConsumptionCombined: null,
  weekdayPrice: null,
  weekendPrice: null,
  hourlyPrice: null,
  deliveryEnabled: false,
  discountPercent: null,
  description: '',
  mainImageUrl: null,
  images: [],
  features: [],
};

/**
 * Trường của TỪNG BƯỚC — dùng để validate **riêng bước đang mở** trước khi cho đi tiếp.
 *
 * Không có nó thì "Tiếp tục" phải validate cả schema, và người dùng bị chặn bởi lỗi của một phần
 * họ còn chưa nhìn thấy. Danh sách khớp `VEHICLE_SECTIONS` của web.
 */
const STEP_FIELDS: Record<string, ReadonlyArray<keyof VehicleFormValues>> = {
  basic: [
    'code',
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
    'sourceType',
  ],
  pricing: [
    'weekdayPrice',
    'weekendPrice',
    'hourlyPrice',
    'monthlyPrice',
    'withDriverDailyPrice',
    'discountPercent',
    'deliveryEnabled',
  ],
  media: ['mainImageUrl', 'images', 'features', 'description'],
  review: [],
};

/**
 * Wizard THÊM XE (VEH-02) — bốn bước, thuần client.
 *
 * ⚠️ Mọi bước giữ giá trị trong CÙNG một form React Hook Form và chỉ gọi API **một lần** ở bước
 * cuối. Backend không có endpoint lưu từng phần, nên không chỗ nào ở đây được nói "đã lưu nháp"
 * giữa chừng.
 *
 * Hai hành động ở bước cuối là hai hành vi backend có thật: "Lưu nháp" = `POST /vehicles` (xe
 * luôn sinh ra ở trạng thái nháp — ADR 0008); "Lưu & Gửi duyệt" = gọi tiếp
 * `POST /vehicles/:id/submit-public`. **Bước hai hỏng thì xe VẪN đã được tạo**, nên thông báo
 * phải nói rõ điều đó — báo "lỗi tạo xe" sẽ khiến người dùng bấm lại và tạo xe thứ hai.
 */
export function CreateVehicleScreen() {
  const t = useTranslations('Vehicles.form');
  const tCommon = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has, isLoading: permissionsLoading } = usePermissions();

  const create = useCreateVehicle();
  const [step, setStep] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [created, setCreated] = useState<{
    vehicle: VehicleDetail;
    submittedForReview: boolean;
  } | null>(null);

  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormSchema,
    'Vehicles.form.validation',
  );
  const {
    control,
    getValues,
    handleSubmit,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver,
    defaultValues: EMPTY_DEFAULTS,
  });

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      { key: 'basic', shortTitle: t('wizard.basic.shortTitle') },
      { key: 'pricing', shortTitle: t('wizard.pricing.shortTitle') },
      { key: 'media', shortTitle: t('wizard.media.shortTitle') },
      { key: 'review', shortTitle: t('wizard.review.shortTitle') },
    ],
    [t],
  );
  const lastStep = steps.length - 1;

  /*
   * Chi nhánh: chọn sẵn cái MẶC ĐỊNH để thao tác vẫn một bước, nhưng vẫn là một trường thật trên
   * form — người dùng thấy xe sẽ nằm ở đâu và đổi được ngay tại đây.
   */
  const branches = useQuery({
    queryKey: queryKeys.branches.list({ status: 'active' }),
    queryFn: () => branchesApi.list('active'),
  });
  const branchId = useWatch({ control, name: 'branchId' });
  const noProvince = tBranches('labels.noProvince');
  const branchOptions = useMemo(
    () =>
      (branches.data?.items ?? []).map((b) => ({
        value: b.id,
        label: branchLabel(b, noProvince),
      })),
    [branches.data, noProvince],
  );

  useEffect(() => {
    // Chỉ điền khi ô còn TRỐNG: người dùng đã chọn tay thì dữ liệu tới muộn không được ghi đè.
    if (branchId) return;
    const preferred = branches.data?.items.find((b) => b.isDefault) ?? branches.data?.items[0];
    if (preferred) setValue('branchId', preferred.id, { shouldValidate: true });
  }, [branchId, branches.data, setValue]);

  /*
   * Kiểu dáng thân xe chỉ có nghĩa với ô tô; nguồn năng lượng cũng phụ thuộc loại phương tiện —
   * xe máy chỉ nhận xăng/điện, nên đổi từ ô tô dầu/hybrid phải xoá lựa chọn không còn hợp lệ.
   */
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, isCar, setValue, vehicleType]);

  const back = () => goBackOr(router, ROUTES.manage.vehicles());

  function submitNow(submitForReview: boolean) {
    void handleSubmit(
      (values) => {
        create.mutate(formValuesToInput(values), {
          onSuccess: async (vehicle) => {
            if (!submitForReview) {
              setCreated({ vehicle, submittedForReview: false });
              return;
            }
            try {
              const submitted = await vehiclesApi.submitPublic(vehicle.id);
              setCreated({ vehicle: submitted, submittedForReview: true });
            } catch (error) {
              // Xe ĐÃ tạo — nói đúng điều đó, đừng để người dùng bấm lại và tạo xe thứ hai.
              toast.showError(t('success.submitFailed', { reason: errorMessage(error) }));
              setCreated({ vehicle, submittedForReview: false });
            }
          },
          onError: (error) => toast.showError(errorMessage(error)),
        });
      },
      /*
       * Gửi mà schema không hợp lệ → **nhảy về bước chứa lỗi đầu tiên**. Không có nó thì màn xác
       * nhận đứng im không giải thích gì.
       */
      (formErrors) => {
        const target = steps.findIndex((candidate) =>
          (STEP_FIELDS[candidate.key] ?? []).some((f) => formErrors[f]),
        );
        if (target >= 0) setStep(target);
      },
    )();
  }

  async function goNext() {
    if (create.isPending) return;
    // Chỉ validate trường của BƯỚC ĐANG MỞ — xem docblock của `STEP_FIELDS`.
    const valid = await trigger([...(STEP_FIELDS[steps[step]!.key] ?? [])]);
    if (valid) setStep(step + 1);
  }

  if (!permissionsLoading && !has(PERMISSION.VEHICLE_CREATE)) {
    return (
      <>
        <AppHeader title={t('wizard.basic.title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('wizard.basic.title')} />
        </Screen>
      </>
    );
  }

  if (created) {
    return (
      <VehicleCreateSuccess
        vehicle={created.vehicle}
        submittedForReview={created.submittedForReview}
        onCreateAnother={() => {
          setCreated(null);
          setStep(0);
        }}
        onClose={back}
      />
    );
  }

  const stepKey = steps[step]!.key;
  const stepErrors = (STEP_FIELDS[stepKey] ?? []).filter((f) => errors[f]).length;

  return (
    <>
      <AppHeader
        title={t(`wizard.${stepKey}.title` as 'wizard.basic.title')}
        onBack={() => (isDirty ? setConfirmCancel(true) : back())}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={
          <XStack gap={space.sm}>
            {step > 0 ? (
              <YStack f={1}>
                <Button
                  label={tCommon('back')}
                  variant="secondary"
                  onPress={() => setStep(step - 1)}
                />
              </YStack>
            ) : null}
            {step < lastStep ? (
              <YStack f={2}>
                <Button label={tCommon('next')} onPress={() => void goNext()} />
              </YStack>
            ) : (
              <>
                <YStack f={1}>
                  <Button
                    label={t('wizard.saveDraft')}
                    variant="secondary"
                    loading={create.isPending}
                    onPress={() => submitNow(false)}
                  />
                </YStack>
                <YStack f={1}>
                  <Button
                    label={t('wizard.saveAndSubmit')}
                    loading={create.isPending}
                    onPress={() => submitNow(true)}
                  />
                </YStack>
              </>
            )}
          </XStack>
        }
      >
        <YStack gap={layout.section}>
          <VehicleWizardBar steps={steps} current={step} onStepChange={setStep} />

          {stepErrors > 0 ? (
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('wizard.stepErrors', { count: stepErrors })}
            </Text>
          ) : null}

          {stepKey === 'basic' ? (
            /*
              Ba khối nối nhau, đúng bước 1 của `VehicleForm` bên web: cơ bản → thông số vận hành
              → hình thức nguồn xe. Nguồn xe CHỈ hỏi ở đây, không hỏi lại ở màn sửa.
            */
            <>
              <BasicStep
                control={control}
                branchOptions={branchOptions}
                branchLoading={branches.isPending}
              />
              <SpecsSection control={control} isCar={isCar} />
              <SourceTypeSection control={control} />
            </>
          ) : stepKey === 'pricing' ? (
            <CreateVehiclePricingStep control={control} isCar={isCar} />
          ) : stepKey === 'media' ? (
            <MediaStep control={control} isCar={isCar} />
          ) : (
            <ReviewStep values={getValues()} onEditStep={setStep} />
          )}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirmCancel}
        title={t('wizard.cancelWizard.title')}
        message={t('wizard.cancelWizard.body')}
        confirmLabel={t('wizard.cancelWizard.ok')}
        cancelLabel={t('wizard.cancelWizard.cancel')}
        destructive
        onConfirm={back}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}

/**
 * Bước xác nhận — bốn thẻ tổng kết đúng những gì đã nhập, mỗi thẻ có lối "Chỉnh sửa" quay về
 * ĐÚNG bước của nó. Thông số kỹ thuật nâng cao không xuất hiện: luồng tạo không thu thập chúng.
 */
function ReviewStep({
  values,
  onEditStep,
}: {
  values: VehicleFormValues;
  onEditStep: (step: number) => void;
}) {
  const t = useTranslations('Vehicles.form.review');
  const tUnits = useTranslations('Common.units');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const labels = useCatalogLabels();

  const empty = tLabels('emptyValue');
  const text = (value: string | number | null | undefined): string =>
    value == null || value === '' ? empty : String(value);
  const money = (value: number | null | undefined): string =>
    value == null ? empty : fmt.money(String(value));

  const brandAndModel = [labels.brandLabel(values.brand), values.model].filter(Boolean).join(' ');
  const bodyType = values.bodyType ? labels.bodyTypeLabel(values.bodyType) : null;

  const groups = [
    {
      key: 'basic',
      title: t('groups.basic'),
      step: 0,
      items: [
        { label: t('name'), value: text(values.name) },
        { label: t('code'), value: text(values.code) },
        {
          label: t('typeAndService'),
          value: `${domainLabel('vehicleType', values.vehicleType)} / ${fmt.serviceTypes(values.serviceTypes)}`,
        },
        {
          label: t('operationStatus'),
          value: domainLabel('vehicleOperationStatus', values.operationStatus),
        },
        { label: t('sourceType'), value: domainLabel('vehicleSourceType', values.sourceType) },
      ],
    },
    {
      key: 'specs',
      title: t('groups.specs'),
      step: 0,
      items: [
        { label: t('plateNumber'), value: text(values.plateNumber) },
        {
          label: t('brandAndBody'),
          value: !brandAndModel
            ? empty
            : bodyType
              ? t('brandWithBody', { brand: brandAndModel, bodyType })
              : brandAndModel,
        },
        {
          label: t('seatsAndFuel'),
          value:
            [
              values.seatCount ? tUnits('seat', { count: values.seatCount }) : null,
              values.fuelType ? labels.fuelTypeLabel(values.fuelType) : null,
            ]
              .filter(Boolean)
              .join(' / ') || empty,
        },
        {
          label: t('yearAndColor'),
          value: [values.manufactureYear, values.color].filter(Boolean).join(' / ') || empty,
        },
      ],
    },
    {
      key: 'pricing',
      title: t('groups.pricing'),
      step: 1,
      items: [
        { label: t('weekdayPrice'), value: money(values.weekdayPrice) },
        { label: t('weekendPrice'), value: money(values.weekendPrice) },
        {
          label: t('discount'),
          value:
            values.discountPercent == null
              ? empty
              : t('discountValue', { percent: values.discountPercent }),
        },
        {
          label: t('policy'),
          value: values.deliveryEnabled ? t('policyDelivery') : t('policyNone'),
        },
      ],
    },
    {
      key: 'media',
      title: t('groups.media'),
      step: 2,
      items: [
        {
          label: t('overview'),
          value: t('overviewValue', {
            mainImage: values.mainImageUrl ? t('mainImageSet') : t('mainImageMissing'),
            gallery: (values.images ?? []).length,
            features: (values.features ?? []).length,
          }),
        },
      ],
    },
  ];

  return (
    <YStack gap={layout.section}>
      {groups.map((group) => (
        <Card key={group.key}>
          <YStack gap={space.sm}>
            <XStack ai="center" jc="space-between">
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {group.title}
              </Text>
              <Button
                label={t('editStep')}
                variant="ghost"
                size="sm"
                block={false}
                onPress={() => onEditStep(group.step)}
              />
            </XStack>
            {group.items.map((item) => (
              <DataRow key={item.label} label={item.label} value={item.value} />
            ))}
          </YStack>
        </Card>
      ))}
    </YStack>
  );
}
