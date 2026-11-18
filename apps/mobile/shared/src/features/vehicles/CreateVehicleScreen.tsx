import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useBranchReturnParam } from '@/features/branches/hooks/use-branch-filter';
import {
  PERMISSION,
  PUBLISH_REQUIREMENT,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
  requiredVehicleImageTypes,
  type PublishRequirement,
} from '@xeprime/types';
import { vehicleFormWithPhotosSchema, type VehicleFormValues } from '@xeprime/validators';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import {
  BasicStep,
  FeaturesDescriptionCard,
  ImagesCard,
  SourceTypeSection,
  SpecsSection,
} from './components/VehicleFormSteps';
import { RegistrationCapture } from './components/RegistrationCapture';
import { CreateReadinessCard } from './components/CreateReadinessCard';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  type RegistrationCaptureState,
} from './registration-capture';
import { vehicleSettingsApi } from '@/api/vehicle-settings/api';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Pill } from '@/components/ui/Pill';
import { CreateVehiclePricingStep } from './components/CreateVehiclePricingStep';
import { VehicleWizardBar, type WizardStep } from './components/VehicleWizardBar';
import { VehicleCreateSuccess } from './components/VehicleCreateSuccess';
import { formValuesToInput } from './mappers';
import { missingPublishRequirementsForForm } from './publication';
import { usePublicationLabels } from './hooks/use-publication-labels';
import { useCreateVehicle } from './hooks/use-vehicle';
import { branchLabel, vehiclesApi, type VehicleDetail } from './api';
// Lỗi hạn mức gói (ADR 0065) nói đúng loại xe + con số thay cho câu chung — như web.
import { usePlanAwareErrorMessage } from '@/features/subscription/plan-quota-gate';

/** Mặc định khi tạo mới: chọn sẵn giá trị hợp lệ để các ô bắt buộc không rỗng. */
const EMPTY_DEFAULTS: VehicleFormValues = {
  code: '',
  insuredValue: null,
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
  motorbikeCategory: null,
  vehicleCatalogModelId: null,
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
  electricRangeKm: null,
  batteryCapacityKwh: null,
  electricConsumptionKwhPer100Km: null,
  weekdayPrice: null,
  weekendPrice: null,
  hourlyPrice: null,
  deliveryEnabled: false,
  discountPercent: null,
  description: '',
  images: [],
  media: [],
  features: [],
};

/**
 * Trường của TỪNG BƯỚC — dùng để validate **riêng bước đang mở** trước khi cho đi tiếp, và để lỗi
 * (yup hoặc server) dẫn về đúng bước. Khớp `CREATE_STEP_FIELDS` của web (Figma `24352:70390`).
 */
const STEP_FIELDS: Record<CreateStepKey, ReadonlyArray<keyof VehicleFormValues>> = {
  basic: [
    'media',
    'images',
    'vehicleType',
    'name',
    'plateNumber',
    'branchId',
    'code',
    'operationStatus',
    'brand',
    'model',
    'vehicleCatalogModelId',
    'vehicleCatalogVariantId',
    'manufactureYear',
    'color',
    'seatCount',
    'motorbikeCategory',
    'bodyType',
    'insuredValue',
    'fuelType',
    'transmission',
    'fuelConsumptionCombined',
    'engineDisplacementCc',
    'electricRangeKm',
    'batteryCapacityKwh',
    'electricConsumptionKwhPer100Km',
    'sourceType',
  ],
  pricing: [
    'serviceTypes',
    'weekdayPrice',
    'weekendPrice',
    'hourlyPrice',
    'discountPercent',
    'withDriverDailyPrice',
    'withDriverInterCityPrice',
    'withDriverOneWayPrice',
    'monthlyPrice',
    'deliveryEnabled',
  ],
  features: ['features', 'description'],
};

type CreateStepKey = 'basic' | 'pricing' | 'features';
const STEP_KEYS: readonly CreateStepKey[] = ['basic', 'pricing', 'features'];

/** Điều kiện lên chợ thuộc BƯỚC nào — thiếu thì chặn đúng bước đó (như web). */
const REQUIREMENT_STEP: Record<PublishRequirement, CreateStepKey> = {
  [PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]: 'pricing',
  [PUBLISH_REQUIREMENT.LONG_TERM_PRICE]: 'pricing',
  [PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE]: 'pricing',
  [PUBLISH_REQUIREMENT.PHOTOS]: 'basic',
  [PUBLISH_REQUIREMENT.PLATE_NUMBER]: 'basic',
  [PUBLISH_REQUIREMENT.IDENTITY]: 'basic',
  [PUBLISH_REQUIREMENT.ENERGY_SPEC]: 'basic',
  [PUBLISH_REQUIREMENT.BRANCH_LOCATION]: 'basic',
};

/** MỌI ô của wizard — bộ lọc cho lỗi validate từ server, dựng từ chính `STEP_FIELDS`. */
const WIZARD_FIELDS: ReadonlyArray<keyof VehicleFormValues> = Object.values(STEP_FIELDS).flat();

/**
 * Wizard THÊM XE — bản native của `VehicleForm` web theo Figma `24352:70390` (17/11/2026): ba bước
 * Thông tin xe (ảnh + cà vẹt + thông tin) → Dịch vụ & giá → Tiện ích & mô tả, mức "Sẵn sàng gửi duyệt"
 * ở đầu mỗi bước, và tấm XÁC NHẬN thay bước "Xác nhận" cũ.
 *
 * ⚠️ Thuần client: mọi bước giữ giá trị trong CÙNG một form và chỉ gọi API **một lần** khi lưu.
 * "Lưu nháp" = `POST /vehicles`; "Gửi duyệt" = gọi tiếp `submit-public`. Bước sau hỏng thì xe VẪN đã
 * tạo — nói rõ điều đó, không để người dùng bấm lại tạo xe thứ hai.
 */
export function CreateVehicleScreen() {
  const colors = useColors();
  const t = useTranslations('Vehicles.form');
  const tCommon = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const tPermission = useTranslations('ManageCommon.permission');
  const tCreate = useTranslations('Vehicles.create');
  const tSteps = useTranslations('Vehicles.form.createSteps');
  const tConfirm = useTranslations('Vehicles.form.confirm');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = usePlanAwareErrorMessage();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const { formGaps } = usePublicationLabels();

  const create = useCreateVehicle();
  const [step, setStep] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [created, setCreated] = useState<{
    vehicle: VehicleDetail;
    submittedForReview: boolean;
  } | null>(null);

  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormWithPhotosSchema,
    'Vehicles.form.validation',
  );
  const applyApiFieldErrors = useApiFieldErrors();

  const {
    control,
    getValues,
    handleSubmit,
    setError,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver,
    defaultValues: EMPTY_DEFAULTS,
  });

  const steps = useMemo<readonly WizardStep[]>(
    () => STEP_KEYS.map((key) => ({ key, shortTitle: t(`wizard.${key}.shortTitle`) })),
    [t],
  );
  const lastStep = steps.length - 1;

  /* Chi nhánh: chọn sẵn (gợi ý `?branchId=` → mặc định → đầu tiên), vẫn là một trường thật. */
  const branches = useActiveBranches();
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
  const hintedBranchId = useBranchReturnParam();
  useEffect(() => {
    if (branchId) return;
    const items = branches.data?.items;
    const preferred =
      items?.find((b) => b.id === hintedBranchId) ?? items?.find((b) => b.isDefault) ?? items?.[0];
    if (preferred) setValue('branchId', preferred.id, { shouldValidate: true });
  }, [branchId, branches.data, setValue, hintedBranchId]);

  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, isCar, setValue, vehicleType]);

  /* Cà vẹt (ADR 0089 · 0099) — BẮT BUỘC khi thêm MỌI loại xe; app không có phiên hỗ trợ. */
  const [registration, setRegistration] = useState<RegistrationCaptureState>(EMPTY_REGISTRATION);
  const [registrationShowErrors, setRegistrationShowErrors] = useState(false);
  const plateNumber = useWatch({ control, name: 'plateNumber' });
  const registrationCheck = checkRegistration(registration, plateNumber);

  /** Điều kiện lên chợ còn thiếu — CÙNG luật với cổng gửi duyệt ở backend. */
  const [publishMissing, setPublishMissing] = useState<PublishRequirement[]>([]);
  function publishGaps(stepKey?: CreateStepKey): PublishRequirement[] {
    const missing = missingPublishRequirementsForForm(getValues());
    return stepKey ? missing.filter((key) => REQUIREMENT_STEP[key] === stepKey) : missing;
  }

  const back = () => goBackOr(router, ROUTES.manage.vehicles());
  const goToStep = (key: CreateStepKey) => setStep(Math.max(0, STEP_KEYS.indexOf(key)));

  /** Cổng chung trước MỌI lượt lưu — điều kiện lên chợ, rồi cà vẹt; nhảy về đúng bước. */
  function passesGates(): boolean {
    const missing = publishGaps();
    setPublishMissing(missing);
    if (missing.length > 0) {
      goToStep(REQUIREMENT_STEP[missing[0]!]);
      toast.showError(t('wizard.missingTitle'));
      return false;
    }
    if (!registrationCheck.ok) {
      setRegistrationShowErrors(true);
      goToStep('basic');
      toast.showError(t('wizard.missingTitle'));
      return false;
    }
    return true;
  }

  function jumpToFirstError(hasError: (field: keyof VehicleFormValues) => boolean) {
    const target = STEP_KEYS.findIndex((key) => STEP_FIELDS[key].some(hasError));
    if (target >= 0) setStep(target);
  }

  function submitNow(submitForReview: boolean) {
    if (!passesGates()) {
      setConfirmSubmit(false);
      return;
    }
    const withAutoAccept =
      autoAcceptEnabled && (getValues('serviceTypes') ?? []).includes(SERVICE_TYPE.SELF_DRIVE);
    void handleSubmit(
      (values) => {
        create.mutate(
          { ...formValuesToInput(values), registration: registrationCheck.input },
          {
            onSuccess: async (vehicle) => {
              // "Tự động đồng ý nhận chuyến" — thiết lập dịch vụ tự lái, ghi sau khi xe có id (như web).
              if (withAutoAccept) {
                try {
                  await vehicleSettingsApi.patchServiceSetting(vehicle.id, SERVICE_TYPE.SELF_DRIVE, {
                    autoAcceptEnabled: true,
                  });
                } catch (error) {
                  toast.showError(tCreate('autoAcceptNotSaved', { error: errorMessage(error) }));
                }
              }
              if (!submitForReview) {
                toast.showSuccess(tCreate('savedDraft'));
                setCreated({ vehicle, submittedForReview: false });
                return;
              }
              try {
                const submitted = await vehiclesApi.submitPublic(vehicle.id);
                toast.showSuccess(tCreate('createdAndSubmitted'));
                setCreated({ vehicle: submitted, submittedForReview: true });
              } catch (error) {
                // Xe ĐÃ tạo — nói đúng điều đó, đừng để người dùng bấm lại và tạo xe thứ hai.
                toast.showError(tCreate('createdNotSubmitted', { error: errorMessage(error) }));
                setCreated({ vehicle, submittedForReview: false });
              }
            },
            onError: (error) => {
              setConfirmSubmit(false);
              toast.showError(errorMessage(error));
              const applied = applyApiFieldErrors(error, setError, { fields: WIZARD_FIELDS });
              if (applied.length === 0) return;
              const bad = new Set<string>(applied);
              jumpToFirstError((f) => bad.has(f));
            },
          },
        );
      },
      (formErrors) => {
        setConfirmSubmit(false);
        toast.showError(t('wizard.missingTitle'));
        jumpToFirstError((f) => Boolean(formErrors[f]));
      },
    )();
  }

  /** "Gửi duyệt" mở tấm xác nhận — chỉ khi mọi cổng đã qua và toàn form hợp lệ. */
  function openConfirm() {
    if (!passesGates()) return;
    void handleSubmit(
      () => setConfirmSubmit(true),
      (formErrors) => {
        toast.showError(t('wizard.missingTitle'));
        jumpToFirstError((f) => Boolean(formErrors[f]));
      },
    )();
  }

  async function goNext() {
    if (create.isPending) return;
    const key = STEP_KEYS[step]!;
    const valid = await trigger([...STEP_FIELDS[key]]);
    const missing = valid ? publishGaps(key) : [];
    setPublishMissing(missing);
    const registrationGap = key === 'basic' && !registrationCheck.ok;
    if (registrationGap) setRegistrationShowErrors(true);
    if (valid && missing.length === 0 && !registrationGap) setStep(step + 1);
  }

  /* Mức "Sẵn sàng gửi duyệt" — cùng luật cổng gửi duyệt, chỉ để chủ xe thấy còn thiếu gì. */
  const watched = useWatch({ control });
  const readiness = useMemo(() => {
    const values = { ...EMPTY_DEFAULTS, ...watched } as VehicleFormValues;
    const gaps = missingPublishRequirementsForForm(values);
    const media = values.media ?? [];
    return {
      photos:
        requiredVehicleImageTypes(values.vehicleType).every((slot) =>
          media.some((item) => item.type === slot),
        ) && registrationCheck.ok,
      info:
        Boolean(values.name?.trim() && values.branchId) &&
        !gaps.some((g) => REQUIREMENT_STEP[g] === 'basic' && g !== PUBLISH_REQUIREMENT.PHOTOS),
      pricing:
        (values.serviceTypes ?? []).length > 0 &&
        !gaps.some((g) => REQUIREMENT_STEP[g] === 'pricing'),
      features: (values.features ?? []).length > 0 || Boolean(values.description?.trim()),
    };
  }, [watched, registrationCheck.ok]);
  const requiredPhotos = requiredVehicleImageTypes(vehicleType ?? VEHICLE_TYPE.CAR).length + 1;

  if (!permissionsLoading && !has(PERMISSION.VEHICLE_CREATE)) {
    return (
      <>
        <AppHeader title={tCreate('title')} onBack={back} />
        <Screen scrollReveal edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tCreate('forbiddenTitle')}
            description={`${tCreate('forbiddenBody')}\n${tPermission('requires')} ${PERMISSION.VEHICLE_CREATE}`}
            actionLabel={tCreate('backToList')}
            onAction={back}
          />
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

  const stepKey = STEP_KEYS[step]!;
  const stepErrors =
    STEP_FIELDS[stepKey].filter((f) => errors[f]).length +
    (stepKey === 'basic' && registrationShowErrors
      ? Object.keys(registrationCheck.errors).length
      : 0);

  return (
    <>
      <AppHeader
        title={tCreate('title')}
        onBack={() => (isDirty ? setConfirmCancel(true) : back())}
      />
      <Screen
        scrollReveal
        edges={['left', 'right', 'bottom']}
        footer={
          <XStack gap={space.sm}>
            {step > 0 ? (
              <YStack flexShrink={0}>
                <Button
                  label={tCommon('back')}
                  variant="outline"
                  onPress={() => setStep(step - 1)}
                />
              </YStack>
            ) : null}
            {step < lastStep ? (
              <YStack f={1}>
                <Button
                  variant="gradient"
                  label={tCommon('next')}
                  icon="arrow-forward"
                  onPress={() => void goNext()}
                />
              </YStack>
            ) : (
              <YStack f={1}>
                <Button
                  variant="gradient"
                  label={t('wizard.submit')}
                  icon="send-outline"
                  loading={create.isPending}
                  onPress={openConfirm}
                />
              </YStack>
            )}
          </XStack>
        }
      >
        <YStack gap={layout.section}>
          <VehicleWizardBar steps={steps} current={step} onStepChange={setStep} />

          <CreateReadinessCard
            readiness={readiness}
            requiredPhotos={requiredPhotos}
          />

          {create.isError ? <Callout tone="danger">{errorMessage(create.error)}</Callout> : null}
          {publishMissing.length > 0 ? (
            <Callout tone="danger">
              {t('wizard.publishRequired', { items: formGaps(publishMissing, getValues()) })}
            </Callout>
          ) : null}
          {stepErrors > 0 ? (
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('wizard.stepErrors', { count: stepErrors })}
            </Text>
          ) : null}

          {stepKey === 'basic' ? (
            <>
              <ImagesCard
                control={control}
                title={tSteps('photosTitle')}
                badge={<Pill tone="warning" label={tSteps('photosRequired', { count: requiredPhotos })} />}
              >
                <RegistrationCapture
                  state={registration}
                  onChange={setRegistration}
                  vehiclePlate={plateNumber}
                  showErrors={registrationShowErrors}
                />
              </ImagesCard>
              <Card>
                <YStack gap={space.md}>
                  <BasicStep
                    control={control}
                    branchOptions={branchOptions}
                    branchLoading={branches.isPending}
                    hideServiceTypes
                  />
                  <SpecsSection control={control} isCar={isCar} setValue={setValue} />
                  <SourceTypeSection control={control} />
                </YStack>
              </Card>
            </>
          ) : stepKey === 'pricing' ? (
            <CreateVehiclePricingStep
              control={control}
              isCar={isCar}
              setValue={setValue}
              autoAccept={{ value: autoAcceptEnabled, onChange: setAutoAcceptEnabled }}
            />
          ) : (
            <FeaturesDescriptionCard control={control} title={tSteps('featuresTitle')} />
          )}
        </YStack>
      </Screen>

      {/* Tấm xác nhận — thay bước "Xác nhận" cũ (Figma `24335:66465`). */}
      <BottomSheet
        open={confirmSubmit}
        onClose={() => (create.isPending ? undefined : setConfirmSubmit(false))}
        title={tConfirm('title')}
        subtitle={tConfirm('subtitle')}
        dismissable={!create.isPending}
        footer={
          <XStack gap={space.sm}>
            <YStack flexShrink={0}>
              <Button
                label={tConfirm('saveDraft')}
                variant="outline"
                loading={create.isPending}
                onPress={() => submitNow(false)}
              />
            </YStack>
            <YStack f={1}>
              <Button
                variant="gradient"
                label={tConfirm('submit')}
                icon="send-outline"
                loading={create.isPending}
                onPress={() => submitNow(true)}
              />
            </YStack>
          </XStack>
        }
      >
        <YStack gap={space.md}>
          <ReviewStep
            values={getValues()}
            onEditStep={(next) => {
              setConfirmSubmit(false);
              setStep(next);
            }}
          />
          <Callout tone="info">{tConfirm('note')}</Callout>
        </YStack>
      </BottomSheet>

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
  const colors = useColors();
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
            photos: (values.media ?? []).length,
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
