import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InlineAction } from '@/components/ui/InlineAction';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { VehicleWizardBar } from '@/features/vehicles/components/VehicleWizardBar';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { branchLabel } from '@/features/branches/api';
import { ROUTES, vehicleListPathFor } from '@/navigation/routes';
import type { VehicleRegistrationSource } from '@/navigation/vehicle-registration-source';
import { colors, fontSize, space } from '@/theme/tokens';
import {
  QUICK_VEHICLE_DEFAULTS,
  missingEnergyFields,
  quickVehicleSchema,
  type QuickVehicleValues,
} from './quick-schema';
import { useQuickVehicleRegistration } from './hooks/use-quick-vehicle';
import { QuickVehicleOwnerStep } from './components/QuickVehicleOwnerStep';
import { QuickVehicleInfoStep } from './components/QuickVehicleInfoStep';
import { QuickVehicleRentalStep } from './components/QuickVehicleRentalStep';
import { QuickVehicleImagesStep } from './components/QuickVehicleImagesStep';
import { QuickVehicleSuccess } from './components/QuickVehicleSuccess';

/** Trường của từng bước — validate ĐÚNG bước đang mở, và đưa lỗi về đúng chỗ. */
const STEP_FIELDS = {
  info: [
    'vehicleType',
    'plateNumber',
    'name',
    'brand',
    'model',
    'seatCount',
    'manufactureYear',
    'color',
    'fuelType',
    'transmission',
    'fuelConsumptionCombined',
    'electricRangeKm',
    'batteryCapacityKwh',
    'electricConsumptionKwhPer100Km',
    'engineDisplacementCc',
    'description',
    'features',
  ],
  rental: [
    'weekdayPrice',
    'discountEnabled',
    'discountPercent',
    'autoAcceptEnabled',
    'branchId',
    'deliveryEnabled',
    'deliveryFreeWithinKm',
    'deliveryMaxRadiusKm',
    'deliveryFee',
    'mileageLimitEnabled',
    'includedDistanceKmPerDay',
    'excessDistanceFeePerKm',
    'termsText',
  ],
  images: ['mainImageUrl', 'images'],
} as const satisfies Record<string, ReadonlyArray<keyof QuickVehicleValues>>;

const STEP_KEYS = ['info', 'rental', 'images'] as const;
type StepKey = (typeof STEP_KEYS)[number];

/**
 * Wizard ĐĂNG XE NHANH — bản native của `QuickVehicleWizard`.
 *
 * **Đây là cửa của TUYẾN HOA HỒNG** (ADR 0028): chủ xe cá nhân đăng xe ngay trong khu KHÁCH và
 * không bao giờ bước vào cổng quản lý. Trước đợt này, hai nút "Đăng xe đầu tiên" và "Thêm xe"
 * của app đẩy thẳng sang `/manage/vehicles/new` — màn sau `ScopeGuard` đòi phải có gian hàng —
 * nên người chưa có shop bấm vào là ăn ngay "Bạn không còn quyền truy cập gian hàng này". Sai cả
 * quyền lẫn tuyến.
 *
 * Ba bước xe, đúng ba bước; bước HỒ SƠ CHỦ XE đứng trước và chỉ xuất hiện với người chưa có hồ
 * sơ. Nó không nằm trong `STEP_KEYS` vì ba bước kia là các mảnh của MỘT form xe (cùng một
 * `useForm`, cùng một lần lưu), còn bước hồ sơ là một form khác gọi một API khác và chỉ chạy
 * đúng một lần trong đời tài khoản.
 *
 * Không có bước "Xác nhận" thứ tư: mỗi bước đã hiển thị đủ thứ nó hỏi, nên nút chính ở bước cuối
 * nói ĐÚNG hành động sắp xảy ra ("Lưu & gửi duyệt" / "Lưu nháp"), không phải "Kế tiếp".
 */
export function QuickVehicleWizardScreen({ source }: { source: VehicleRegistrationSource }) {
  const t = useTranslations('ListYourVehicle.wizard');
  const tOwner = useTranslations('ListYourVehicle.ownerProfile');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const applyApiFieldErrors = useApiFieldErrors();
  const tBranches = useTranslations('Branches');

  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { has } = usePermissions();
  const canCreate = has(PERMISSION.VEHICLE_CREATE);
  const branches = useActiveBranches();
  const registration = useQuickVehicleRegistration();

  const resolver = useValidationResolver<QuickVehicleValues>(
    quickVehicleSchema,
    'ListYourVehicle.validation',
    // `quickVehicleSchema` pick phần lớn trường từ `vehicleFormSchema`, và mã lỗi của chúng
    // thuộc namespace của form xe — không có vế này thì chúng lọt ra giao diện ở dạng thô.
    'Vehicles.form.validation',
  );
  const { control, getValues, setValue, setError, trigger, formState } =
    useForm<QuickVehicleValues>({
      resolver,
      defaultValues: QUICK_VEHICLE_DEFAULTS,
    });

  const [step, setStep] = useState<StepKey>('info');
  /*
   * Giữ bước hồ sơ trên thanh bước SAU KHI nó xong, thay vì để thanh bước co từ 4 xuống 3 và
   * "Thông tin xe" nhảy từ số 2 về số 1 ngay dưới tay người dùng.
   */
  const [ownerStepDone, setOwnerStepDone] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof registration.run>> | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  /* Lui về ĐÚNG nơi đã vào — khu tài khoản, cổng quản lý, hay trang giới thiệu. */
  const exit = () => goBackOr(router, vehicleListPathFor(source));

  /** Chi nhánh mặc định chọn sẵn — chủ xe một chi nhánh không phải chọn, nhưng vẫn thấy nó ở bước 2. */
  const branchItems = branches.data?.items;
  useEffect(() => {
    if (getValues('branchId')) return;
    const preferred = branchItems?.find((b) => b.isDefault) ?? branchItems?.[0] ?? null;
    if (preferred) setValue('branchId', preferred.id, { shouldValidate: false });
  }, [branchItems, getValues, setValue]);

  /* Nhãn "Tên · Tỉnh" dùng chung với web: chi nhánh thiếu tỉnh nói thẳng ra, vì xe của nó không
     lên chợ được — đó là việc cần xử lý, không phải chi tiết để giấu. */
  const noProvince = tBranches('labels.noProvince');
  const branchOptions = useMemo(
    () => (branchItems ?? []).map((b) => ({ value: b.id, label: branchLabel(b, noProvince) })),
    [branchItems, noProvince],
  );

  const needsOwnerProfile = user != null && user.tenant == null;
  /** Thanh bước có 4 mục khi luồng này phải đi qua hồ sơ chủ xe, 3 mục khi không. */
  const withOwnerStep = needsOwnerProfile || ownerStepDone;

  const steps = useMemo(
    () =>
      STEP_KEYS.map((key) => ({
        key,
        title: t(`steps.${key}.title` as never),
        shortTitle: t(`steps.${key}.short` as never),
        heading: t(`steps.${key}.heading` as never),
        fields: STEP_FIELDS[key],
      })),
    [t],
  );

  /*
   * Hai chỉ số khác nhau, và trộn chúng là nguồn lỗi:
   *  - `vehicleIndex` điều khiển LOGIC (bước nào của form xe, tiến/lùi, bước cuối);
   *  - `barIndex` chỉ để tô sáng đúng ô trên thanh bước.
   */
  const vehicleIndex = STEP_KEYS.indexOf(step);
  const barIndex = withOwnerStep ? vehicleIndex + 1 : vehicleIndex;
  const isLastStep = vehicleIndex === STEP_KEYS.length - 1;
  const barSteps = useMemo(
    () =>
      withOwnerStep
        ? [{ key: 'owner', shortTitle: tOwner('step.short') }, ...steps]
        : steps.map((s) => ({ key: s.key, shortTitle: s.shortTitle })),
    [withOwnerStep, tOwner, steps],
  );

  if (userLoading) {
    return (
      <>
        <AppHeader title={t('exit')} onBack={exit} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AppHeader title={t('exit')} onBack={exit} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="log-in-outline"
            title={t('signInTitle')}
            description={t('signInBody')}
            actionLabel={t('signInCta')}
            onAction={() => router.push(ROUTES.account.login())}
          />
        </Screen>
      </>
    );
  }

  /*
   * Chưa có hồ sơ chủ xe → hỏi NGAY TẠI ĐÂY, không đẩy sang màn đăng ký gian hàng.
   *
   * Đường cũ bắt người chỉ có một chiếc xe đi qua form "đăng ký gian hàng" ở một khu khác, rồi
   * thả họ lại ở hồ sơ gian hàng thay vì chỗ đang làm dở.
   */
  if (needsOwnerProfile && !ownerStepDone) {
    return (
      <>
        <AppHeader title={t('exit')} onBack={exit} />
        <Screen edges={['left', 'right', 'bottom']}>
          <VehicleWizardBar steps={barSteps} current={0} onStepChange={() => undefined} />
          <QuickVehicleOwnerStep
            onCreated={() => {
              setOwnerStepDone(true);
              setStep('info');
            }}
            onCancel={exit}
          />
        </Screen>
      </>
    );
  }

  /*
   * Hồ sơ vừa tạo xong nhưng `/auth/me` chưa trả về tenant + quyền mới. Chờ ở đây, nếu không
   * người dùng thấy nháy qua màn "Không có quyền thêm xe" ngay sau khi tạo hồ sơ thành công.
   */
  if (ownerStepDone && !user.tenant) {
    return (
      <>
        <AppHeader title={t('exit')} onBack={exit} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (!canCreate) {
    return (
      <>
        <AppHeader title={t('exit')} onBack={exit} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbiddenTitle')}
            description={t('forbiddenBody')}
            actionLabel={t('backToList')}
            onAction={exit}
          />
        </Screen>
      </>
    );
  }

  if (result) {
    return (
      <QuickVehicleSuccess
        result={result}
        source={source}
        onAddAnother={() => {
          setResult(null);
          setStep('info');
        }}
        onDone={exit}
      />
    );
  }

  /** Lưu — `submitForReview` quyết định có gọi `submit-public` sau khi tạo hay không. */
  async function save(submitForReview: boolean) {
    setStepError(null);
    const valid = await trigger(steps.flatMap((s) => [...s.fields]));
    const energyMissing = missingEnergyFields(getValues());
    if (!valid || energyMissing.length > 0) {
      // Đưa người dùng về đúng bước chứa lỗi — không để họ đứng ở bước ảnh với một toast chung.
      const target = steps.find((s) =>
        s.fields.some((field) => formState.errors[field] || energyMissing.includes(field as never)),
      );
      if (target) setStep(target.key);
      if (energyMissing.length > 0) setStepError(t('errors.energyRequired'));
      return;
    }

    try {
      const outcome = await registration.run(getValues(), {
        submitForReview,
        toMessage: errorMessage,
      });
      setResult(outcome);
      if (!outcome.partialError) {
        toast.showSuccess(outcome.submitted ? t('savedAndSubmitted') : t('savedDraft'));
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'busy') return;
      /*
       * Server bắt được thứ yup bỏ lọt → gắn vào ĐÚNG ô và đưa người dùng về bước chứa nó. Không
       * có đoạn này, một lỗi cấp trường chỉ còn là một dòng chung ở cuối màn, và người dùng phải
       * tự dò ba bước để tìm ô sai.
       */
      const applied = applyApiFieldErrors(err, setError, {
        fields: steps.flatMap((item) => [...item.fields]),
      });
      if (applied.length > 0) {
        const bad = new Set<string>(applied);
        const target = steps.find((item) => item.fields.some((field) => bad.has(field)));
        if (target) setStep(target.key);
      } else {
        setStepError(errorMessage(err));
      }
    }
  }

  /**
   * Chạm vào thanh bước — chỉ cho LÙI về bước đã qua.
   *
   * Nhảy TỚI một bước chưa validate là bỏ qua đúng thứ thanh bước đang hứa là đã xong; còn ô
   * `owner` (chỉ số 0 khi có nó) là một form KHÁC đã lưu xong, quay lại đó không có nghĩa gì.
   */
  function goToBar(index: number) {
    const target = withOwnerStep ? index - 1 : index;
    if (target < 0 || target >= vehicleIndex) return;
    setStepError(null);
    setStep(STEP_KEYS[target] as StepKey);
  }

  /** Đi tiếp — validate ĐÚNG bước đang mở, và chặn ngay nếu thông số năng lượng còn thiếu. */
  async function next() {
    setStepError(null);
    const okay = await trigger([...STEP_FIELDS[step]]);
    const energyMissing = step === 'info' ? missingEnergyFields(getValues()) : [];
    if (!okay || energyMissing.length > 0) {
      if (energyMissing.length > 0) setStepError(t('errors.energyRequired'));
      return;
    }
    setStep(STEP_KEYS[vehicleIndex + 1] as StepKey);
  }

  return (
    <>
      <AppHeader title={t('exit')} onBack={exit} />
      <Screen edges={['left', 'right', 'bottom']}>
        <VehicleWizardBar steps={barSteps} current={barIndex} onStepChange={goToBar} />

        <YStack gap={space.md}>
          {/* Tiêu đề ĐÁNH SỐ của bước ("2. Thiết lập cho thuê") — cùng chuỗi web dùng. */}
          <BlockTitle>{steps[vehicleIndex]?.heading ?? ''}</BlockTitle>

          {step === 'info' ? <QuickVehicleInfoStep control={control} setValue={setValue} /> : null}
          {step === 'rental' ? (
            <QuickVehicleRentalStep
              control={control}
              branchOptions={branchOptions}
              branchLoading={branches.isLoading}
              branchError={branches.isError}
            />
          ) : null}
          {step === 'images' ? <QuickVehicleImagesStep control={control} /> : null}

          {stepError ? <Callout tone="danger">{stepError}</Callout> : null}

          {/*
            Xe ĐÃ tạo nhưng phần sau lỗi: nói rõ và cho lối đi tiếp. Thiếu dòng này người dùng bấm
            lưu lại vì tưởng chưa có gì — và cái ref giữ chiếc xe vừa tạo là thứ duy nhất ngăn họ
            có hai chiếc xe giống hệt nhau.
          */}
          {registration.createdVehicle && !result ? (
            <Callout tone="warning">
              <YStack gap={space.sm}>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('draftExists')}
                </Text>
                <InlineAction
                  label={t('manageVehicle')}
                  onPress={() =>
                    router.push(ROUTES.account.vehicleManage(registration.createdVehicle!.id))
                  }
                />
              </YStack>
            </Callout>
          ) : null}

          <YStack gap={space.sm}>
            {isLastStep ? (
              <>
                {/*
                  Bước cuối có HAI hành động khác nhau, nên nút chính nói đúng việc nó làm —
                  "Lưu & gửi duyệt" hay "Lưu nháp" — chứ không phải "Kế tiếp".
                */}
                <Button
                  label={t('finish')}
                  loading={registration.pending}
                  onPress={() => void save(true)}
                />
                <Button
                  label={t('saveDraft')}
                  variant="secondary"
                  disabled={registration.pending}
                  onPress={() => void save(false)}
                />
              </>
            ) : (
              <Button label={tCommon('next')} onPress={() => void next()} />
            )}

            {vehicleIndex > 0 ? (
              <Button
                label={tCommon('back')}
                variant="ghost"
                icon="arrow-back"
                disabled={registration.pending}
                onPress={() => setStep(STEP_KEYS[vehicleIndex - 1] as StepKey)}
              />
            ) : (
              /* Bước đầu không có chỗ để lùi — nút phụ là lối THOÁT, đúng như web. */
              <Button label={t('exit')} variant="ghost" icon="arrow-back" onPress={exit} />
            )}
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
