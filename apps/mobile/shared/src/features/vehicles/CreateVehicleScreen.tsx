import { useEffect, useMemo, useRef, useState } from 'react';
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
  packageShopListingGapsOf,
  type PublishRequirement,
} from '@xeprime/types';
import { vehicleCreateFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { TOAST_PRESET } from '@/components/feedback/AppToast';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { LIST_SEPARATOR, isLogoOnlyGate } from '@xeprime/domain';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { CreateDescriptionCard, CreateFeaturesCard } from './components/VehicleFormSteps';
import { CreateVehiclePhotosCard } from './components/CreateVehiclePhotosCard';
import {
  CreateBodyTypeCard,
  CreateSourceTypeCard,
  CreateVehicleInfoCard,
} from './components/CreateVehicleInfoSections';
import { CreateVehicleConfirmContent } from './components/CreateVehicleConfirmContent';
import { CreateWizardHeader } from './components/CreateWizardHeader';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  type RegistrationCaptureState,
} from './registration-capture';
import { vehicleSettingsApi } from '@/api/vehicle-settings/api';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CreateVehiclePricingStep } from './components/CreateVehiclePricingStep';
import type { WizardStep } from './components/VehicleWizardBar';
import { VehicleCreateSuccess } from './components/VehicleCreateSuccess';
import { formValuesToInput } from './mappers';
import { missingPublishRequirementsForForm, publishGapFormFields } from './publication';
import { usePublicationLabels } from './hooks/use-publication-labels';
import { useCreateVehicle } from './hooks/use-vehicle';
import { useAutofillCatalogRent } from './hooks/use-autofill-catalog-rent';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useApplyRegistrationReading, useComposedVehicleName } from './hooks/use-vehicle-data';
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
  const tCreateApp = useTranslations('Vehicles.form.appCreate');
  const tConfirm = useTranslations('Vehicles.form.confirm');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = usePlanAwareErrorMessage();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const { formGaps } = usePublicationLabels();

  const create = useCreateVehicle();
  /*
   * MỘT wizard cho hai tuyến (web 18/11/2026): tuyến hoa hồng dùng chính màn này, ẩn phần chỉ của gian
   * hàng (chi nhánh khi chỉ có một, nguồn xe, chính sách gian hàng). Server vẫn là cổng thật.
   */
  const session = useCurrentUser();
  const commission = resolvePartnerTrack(session.data) === PARTNER_TRACK.COMMISSION;
  /** Hồ sơ gian hàng tuyến gói còn thiếu gì để đăng xe (ADR 0040 điều 7) - `null` = không áp. */
  const shop = useMyShop(true);
  const shopGaps = useMemo(() => packageShopListingGapsOf(shop.data), [shop.data]);
  const tShopGate = useTranslations('Shop.listingGate');
  const tValidation = useTranslations('Vehicles.form.validation');
  const navigateOnce = useNavigateOnce();
  const [step, setStep] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [created, setCreated] = useState<{
    vehicle: VehicleDetail;
    submittedForReview: boolean;
  } | null>(null);

  const resolver = useValidationResolver<VehicleFormValues>(
    // Không có ô tên; hãng + mẫu xe BẮT BUỘC kể cả khi lưu nháp - server ghép tên từ đó (ADR 0102).
    vehicleCreateFormSchema,
    'Vehicles.form.validation',
  );
  const applyApiFieldErrors = useApiFieldErrors();

  const {
    control,
    getValues,
    clearErrors,
    handleSubmit,
    setError,
    setValue,
    trigger,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver,
    defaultValues: EMPTY_DEFAULTS,
  });
  // Chọn mẫu xe ⇒ tự điền giá trị xe + giá thuê tham khảo vào ô còn trống (web `VehicleForm`).
  useAutofillCatalogRent(control, getValues, setValue);

  const steps = useMemo<readonly WizardStep[]>(
    () => STEP_KEYS.map((key) => ({ key, shortTitle: t(`wizard.${key}.title`) })),
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
  const selectedBranchLabel = branchOptions.find((b) => b.value === branchId)?.label ?? null;
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
  // Lượt đọc cà vẹt MỚI điền đè biển số + màu sơn (ADR 0102 điều 6) - đặt ở form gốc, không ở bước.
  useApplyRegistrationReading(registration.reading, setValue);

  /** Tên xe sẽ lưu - ghép như server, cho tấm xác nhận (ADR 0102). */
  const [nameBrand, nameModelId, nameVariantId, nameVariantLabel, nameYear] = useWatch({
    control,
    name: [
      'brand',
      'vehicleCatalogModelId',
      'vehicleCatalogVariantId',
      'catalogVariantLabel',
      'manufactureYear',
    ],
  });
  const autoName = useComposedVehicleName({
    vehicleType,
    brand: nameBrand,
    vehicleCatalogModelId: nameModelId,
    vehicleCatalogVariantId: nameVariantId,
    catalogVariantLabel: nameVariantLabel,
    manufactureYear: nameYear,
  });

  /** Điều kiện lên chợ còn thiếu — CÙNG luật với cổng gửi duyệt ở backend. */
  const [publishMissing, setPublishMissing] = useState<PublishRequirement[]>([]);
  function publishGaps(stepKey?: CreateStepKey): PublishRequirement[] {
    const missing = missingPublishRequirementsForForm(getValues());
    return stepKey ? missing.filter((key) => REQUIREMENT_STEP[key] === stepKey) : missing;
  }

  /*
   * Ô có dấu * mà còn trống theo điều kiện lên chợ (Hộp số, Dung tích, giá…) không nằm trong schema
   * nên resolver không tô đỏ - đánh lỗi tay để ô viền đỏ như các ô khác, gỡ khi ô đã điền.
   */
  const gapErrorFields = useRef<string[]>([]);
  function markPublishGaps(missing: readonly PublishRequirement[]) {
    const fields = publishGapFormFields(missing, getValues());
    for (const field of fields) {
      setError(field as keyof VehicleFormValues, {
        type: 'publishGap',
        message: tValidation('requiredFieldApp'),
      });
    }
    gapErrorFields.current = fields;
  }
  const watchedValues = useWatch({ control });
  useEffect(() => {
    if (gapErrorFields.current.length === 0) return;
    const still = new Set(publishGapFormFields(publishGaps(), getValues()));
    const cleared = gapErrorFields.current.filter((field) => !still.has(field));
    if (cleared.length === 0) return;
    clearErrors(cleared as (keyof VehicleFormValues)[]);
    gapErrorFields.current = gapErrorFields.current.filter((field) => still.has(field));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy lại theo giá trị form
  }, [watchedValues]);

  const back = () => goBackOr(router, ROUTES.manage.vehicles());
  const goToStep = (key: CreateStepKey) => setStep(Math.max(0, STEP_KEYS.indexOf(key)));

  /** Cổng chung trước MỌI lượt lưu — điều kiện lên chợ, rồi cà vẹt; nhảy về đúng bước. */
  function passesGates(): boolean {
    const missing = publishGaps();
    setPublishMissing(missing);
    markPublishGaps(missing);
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
    /*
     * Gửi duyệt mà hồ sơ gian hàng (tuyến gói) còn thiếu ⇒ server sẽ từ chối SAU khi đã tạo xe.
     * Chặn trước, nói rõ thiếu gì + chạm để mở hồ sơ gian hàng; "Lưu nháp" vẫn đi được (web 18/11/2026).
     */
    if (submitForReview && shopGaps && shopGaps.length > 0) {
      const logoOnly = isLogoOnlyGate(shopGaps);
      toast.showNotice({
        title: tShopGate('title'),
        body: logoOnly
          ? `${tShopGate('logoOnly')} ${tShopGate('ctaLogo')}`
          : `${shopGaps.map((gap) => tShopGate(`items.${gap}`)).join(LIST_SEPARATOR)}. ${tShopGate('cta')}`,
        tone: TOAST_PRESET.WARNING,
        onPress: () => navigateOnce(ROUTES.manage.shop()),
      });
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
    markPublishGaps(missing);
    const registrationGap = key === 'basic' && !registrationCheck.ok;
    if (registrationGap) setRegistrationShowErrors(true);
    if (valid && missing.length === 0 && !registrationGap) setStep(step + 1);
  }


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
      />
    );
  }

  const stepKey = STEP_KEYS[step]!;
  const stepErrors =
    STEP_FIELDS[stepKey].filter((f) => errors[f]).length +
    (stepKey === 'basic' && registrationShowErrors
      ? Object.keys(registrationCheck.errors).length
      : 0);

  const saveDraftButton = (
    <Button
      label={tCreateApp('saveDraft')}
      variant="outline"
      loading={create.isPending}
      onPress={() => submitNow(false)}
    />
  );

  return (
    <>
      <CreateWizardHeader
        title={tCreate('title')}
        steps={steps}
        current={step}
        onStepChange={setStep}
        onBack={() => (isDirty ? setConfirmCancel(true) : back())}
      />
      <Screen
        scrollReveal
        edges={['left', 'right', 'bottom']}
        hideFooterWhileTyping
        footer={
          /*
            Figma: bước 1 "Lưu nháp · Tiếp tục →"; bước 2-3 "← Quay lại · Tiếp tục → / Gửi duyệt →".
            "Lưu nháp" CHỈ ở bước 1, đúng Figma (người dùng chốt 28/11/2026, thay bản 27/11 có ở cả ba
            bước); bước 3 vẫn lưu nháp được trong tấm xác nhận "Gửi duyệt".
          */
          <XStack gap={space.md}>
            {step > 0 ? (
              <YStack f={1}>
                <Button
                  label={tCommon('back')}
                  variant="outline"
                  lineIcon="arrow-left"
                  onPress={() => setStep(step - 1)}
                />
              </YStack>
            ) : (
              <YStack f={1}>{saveDraftButton}</YStack>
            )}
            <YStack f={1}>
              {step < lastStep ? (
                <Button
                  variant="outline"
                  label={tCommon('next')}
                  lineIcon="arrow-right"
                  iconEnd
                  onPress={() => void goNext()}
                />
              ) : (
                <Button
                  variant="gradient"
                  label={t('wizard.submit')}
                  lineIcon="arrow-right"
                  iconEnd
                  loading={create.isPending}
                  onPress={openConfirm}
                />
              )}
            </YStack>
          </XStack>
        }
      >
        <YStack gap={layout.section}>
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
              <CreateVehiclePhotosCard
                control={control}
                vehicleType={vehicleType ?? VEHICLE_TYPE.CAR}
                vehicleName={autoName}
                registration={registration}
                onRegistrationChange={setRegistration}
                vehiclePlate={plateNumber}
                showRegistrationErrors={registrationShowErrors}
              />
              <CreateVehicleInfoCard
                control={control}
                isCar={isCar}
                setValue={setValue}
                branchOptions={branchOptions}
                branchLoading={branches.isPending}
                hideBranch={commission && branchOptions.length <= 1}
                registration={registration}
                onRegistrationChange={setRegistration}
                vehiclePlate={plateNumber}
                showRegistrationErrors={registrationShowErrors}
              />
              {isCar ? <CreateBodyTypeCard control={control} /> : null}
              {commission ? null : <CreateSourceTypeCard control={control} />}
            </>
          ) : stepKey === 'pricing' ? (
            <CreateVehiclePricingStep
              control={control}
              isCar={isCar}
              setValue={setValue}
              autoAccept={{ value: autoAcceptEnabled, onChange: setAutoAcceptEnabled }}
              shopPolicy={!commission}
            />
          ) : (
            <>
              <CreateFeaturesCard control={control} />
              <CreateDescriptionCard control={control} />
            </>
          )}
        </YStack>
      </Screen>

      {/* Tấm xác nhận - Figma Thêm xe MB `24486:112581` (bản native của web `CreateVehicleConfirmDialog`). */}
      <BottomSheet
        open={confirmSubmit}
        onClose={() => (create.isPending ? undefined : setConfirmSubmit(false))}
        title={tConfirm('title')}
        subtitle={tConfirm('subtitle')}
        chrome="v2"
        headerDivider
        dismissable={!create.isPending}
        footer={
          <XStack gap={space.md}>
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
                lineIcon="arrow-right"
                iconEnd
                loading={create.isPending}
                onPress={() => submitNow(true)}
              />
            </YStack>
          </XStack>
        }
      >
        <CreateVehicleConfirmContent
          values={{ ...getValues(), name: autoName }}
          branchLabel={selectedBranchLabel}
          registration={{
            chassisNumber: registration.fields.chassisNumber,
            engineNumber: registration.fields.engineNumber,
          }}
        />
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
