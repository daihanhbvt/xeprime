'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { PERMISSION } from '@xeprime/types';

import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  accountVehiclePath,
  vehicleListPathFor,
  type VehicleRegistrationSource,
} from '@/constants/routes';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { VehicleWizard } from '@/features/vehicles/components/VehicleWizard';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { usePermissions } from '@/hooks/use-permissions';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { useQuickVehicleRegistration } from '../hooks';
import { QUICK_VEHICLE_DEFAULTS, missingEnergyFields, quickVehicleSchema } from '../schema';
import type { QuickVehicleValues } from '../schema';
import { QuickVehicleInfoStep } from './steps/QuickVehicleInfoStep';
import { QuickVehicleRentalStep } from './steps/QuickVehicleRentalStep';
import { QuickVehicleImagesStep } from './steps/QuickVehicleImagesStep';
import { QuickVehicleOwnerStep } from './steps/QuickVehicleOwnerStep';
import { QuickVehicleSuccess } from './QuickVehicleSuccess';
import { useQuickVehicleDraft } from '../use-draft';
import styles from './QuickVehicleWizard.module.css';

/** Trường của từng bước — dùng để validate ĐÚNG bước đang mở và để đưa lỗi API về đúng chỗ. */
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
 * Bước hồ sơ chủ xe đứng TRƯỚC ba bước xe, và chỉ xuất hiện với người chưa có hồ sơ.
 *
 * Nó không nằm trong `STEP_KEYS`: ba bước kia là các mảnh của MỘT form xe (cùng một
 * `useForm`, cùng một lần submit), còn bước này là một form khác gọi một API khác và chỉ
 * chạy đúng một lần trong đời tài khoản. Gộp chung vào `QuickVehicleValues` là nhét hồ sơ
 * người vào payload của chiếc xe.
 */
const OWNER_STEP_KEY = 'owner';

/**
 * Wizard ĐĂNG XE NHANH — ba bước, đúng ba bước.
 *
 * Không có bước "Xác nhận" thứ tư như wizard `/manage`: ở đây mỗi bước đã hiển thị đủ thứ nó
 * hỏi, và một màn tổng kết chỉ thêm một lần bấm cho người đang muốn xong việc. Vì vậy nút chính
 * ở bước cuối nói ĐÚNG hành động sắp xảy ra ("Lưu & gửi duyệt" / "Lưu nháp"), không phải "Kế tiếp".
 *
 * Toàn bộ dữ liệu nằm trong MỘT form React Hook Form nên chuyển bước không mất gì. API chỉ được
 * gọi ở bước cuối, và `useQuickVehicleRegistration` giữ chiếc xe đã tạo để lần thử lại không đẻ
 * ra xe thứ hai.
 */
export function QuickVehicleWizard({ source }: { source: VehicleRegistrationSource }) {
  const t = useTranslations('ListYourVehicle.wizard');
  const tOwner = useTranslations('ListYourVehicle.ownerProfile');
  const tCommon = useTranslations('Common.actions');
  const { message } = App.useApp();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const applyApiFieldErrors = useApiFieldErrors();

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
  const { control, getValues, setValue, setError, trigger, formState } = useForm<QuickVehicleValues>(
    { resolver, defaultValues: QUICK_VEHICLE_DEFAULTS },
  );

  const [step, setStep] = useState<StepKey>('info');
  /*
   * Giữ bước hồ sơ trên thanh bước SAU KHI nó xong, thay vì để thanh bước co từ 4 xuống 3 và
   * "Thông tin xe" nhảy từ số 2 về số 1 ngay dưới tay người dùng.
   */
  const [ownerStepDone, setOwnerStepDone] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof registration.run>> | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const headingRef = useRef<HTMLDivElement | null>(null);

  const draft = useQuickVehicleDraft({
    userId: user?.id ?? null,
    tenantId: user?.tenant?.id ?? null,
    getValues,
    setValue,
    enabled: !result,
  });

  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const branchId = useWatch({ control, name: 'branchId' });

  /** Chi nhánh mặc định chọn sẵn — chủ xe một chi nhánh không phải chọn, nhưng vẫn thấy nó ở bước 2. */
  useEffect(() => {
    if (branchId) return;
    const preferred =
      branches.data?.items.find((b) => b.isDefault) ?? branches.data?.items[0] ?? null;
    if (preferred) setValue('branchId', preferred.id, { shouldValidate: false });
  }, [branchId, branches.data, setValue]);

  /** Cảnh báo rời trang khi đang dở — trừ khi đã lưu xong. */
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!formState.isDirty || result) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [formState.isDirty, result]);

  const needsOwnerProfile = user != null && user.tenant == null;
  /** Thanh bước có 4 mục khi luồng này phải đi qua hồ sơ chủ xe, 3 mục khi không. */
  const withOwnerStep = needsOwnerProfile || ownerStepDone;

  const steps = useMemo(
    () =>
      STEP_KEYS.map((key) => ({
        key,
        title: t(`steps.${key}.title`),
        shortTitle: t(`steps.${key}.short`),
        heading: t(`steps.${key}.heading`),
        fields: STEP_FIELDS[key],
      })),
    [t],
  );
  const ownerStep = useMemo(
    () => ({
      key: OWNER_STEP_KEY,
      title: tOwner('step.title'),
      shortTitle: tOwner('step.short'),
    }),
    [tOwner],
  );
  /** Thanh bước (chỉ nhãn) — thứ `VehicleWizard` vẽ. */
  const barSteps = useMemo(
    () => (withOwnerStep ? [ownerStep, ...steps] : steps),
    [withOwnerStep, ownerStep, steps],
  );

  /*
   * Hai chỉ số khác nhau, và trộn chúng là nguồn lỗi:
   *  - `vehicleIndex` điều khiển LOGIC (bước nào của form xe, tiến/lùi, bước cuối);
   *  - `barIndex` chỉ để tô sáng đúng ô trên thanh bước.
   */
  const vehicleIndex = STEP_KEYS.indexOf(step);
  const barIndex = withOwnerStep ? vehicleIndex + 1 : vehicleIndex;
  const isLastStep = vehicleIndex === STEP_KEYS.length - 1;

  if (userLoading) return <LoadingState variant="page" label={t('loading')} />;
  if (!user) {
    return (
      <EmptyState
        variant="empty"
        title={t('signInTitle')}
        description={t('signInBody')}
        action={
          <Link href={ROUTES.MANAGE.LOGIN}>
            <Button type="primary">{t('signInCta')}</Button>
          </Link>
        }
      />
    );
  }
  /*
   * Chưa có hồ sơ chủ xe → hỏi NGAY TẠI ĐÂY, không đẩy sang `/manage/onboarding`.
   *
   * Đường cũ bắt người chỉ có một chiếc xe đi qua form "đăng ký gian hàng" (loại hình doanh
   * nghiệp, email, tên gian hàng), ở một trang khác, rồi thả họ lại ở hồ sơ gian hàng thay vì
   * chỗ đang làm dở.
   */
  if (needsOwnerProfile && !ownerStepDone) {
    return (
      <QuickVehicleOwnerStep
        steps={barSteps}
        source={source}
        onCreated={() => {
          setOwnerStepDone(true);
          setStep('info');
        }}
      />
    );
  }
  /*
   * Hồ sơ vừa tạo xong nhưng `/auth/me` chưa trả về tenant + quyền mới. Chờ ở đây, nếu không
   * người dùng thấy nháy qua màn "Không có quyền thêm xe" ngay sau khi tạo hồ sơ thành công.
   */
  if (ownerStepDone && !user.tenant) {
    return <LoadingState variant="page" label={t('loading')} />;
  }
  if (!canCreate) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbiddenTitle')}
        description={t('forbiddenBody')}
        missingPermissions={[PERMISSION.VEHICLE_CREATE]}
        action={
          <Link href={vehicleListPathFor(source)}>
            <Button type="primary">{t('backToList')}</Button>
          </Link>
        }
      />
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
        s.fields.some(
          (field) => formState.errors[field] || energyMissing.includes(field as never),
        ),
      );
      if (target) setStep(target.key);
      if (energyMissing.length > 0) setStepError(t('errors.energyRequired'));
      headingRef.current?.focus();
      return;
    }

    try {
      const outcome = await registration.run(getValues(), {
        submitForReview,
        toMessage: errorMessage,
      });
      draft.clear();
      setResult(outcome);
      /*
       * Toast nói đúng cái VỪA xảy ra. "Còn thiếu điều kiện" cố ý không có toast: màn kết quả đã
       * liệt kê từng mục ngay bên dưới, và một toast biến mất sau 3 giây là chỗ tệ nhất để đặt
       * một danh sách việc phải làm.
       */
      if (!outcome.partialError && outcome.missingRequirements.length === 0) {
        message.success(outcome.submitted ? t('savedAndSubmitted') : t('savedDraft'));
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'busy') return;
      const applied = applyApiFieldErrors(err, setError, {
        fields: steps.flatMap((s) => [...s.fields]),
      });
      if (applied.length > 0) {
        const bad = new Set(applied);
        const target = steps.find((s) => s.fields.some((field) => bad.has(field)));
        if (target) setStep(target.key);
      } else {
        setStepError(errorMessage(err));
      }
    }
  }

  /**
   * Enter trong ô nhập cũng đi tiếp — nên hành động nằm ở `onSubmit` của thẻ `<form>`, không
   * phải `onClick` của nút. Bước cuối KHÔNG tự gửi: nó có hai hành động khác nhau.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (registration.pending) return;
    if (isLastStep) {
      void save(true);
      return;
    }
    setStepError(null);
    const valid = await trigger([...STEP_FIELDS[step]]);
    const energyMissing = step === 'info' ? missingEnergyFields(getValues()) : [];
    if (!valid || energyMissing.length > 0) {
      if (energyMissing.length > 0) setStepError(t('errors.energyRequired'));
      return;
    }
    setStep(STEP_KEYS[vehicleIndex + 1]!);
    headingRef.current?.focus();
  }

  const footer = isLastStep ? (
    <>
      <Button onClick={() => setStep(STEP_KEYS[vehicleIndex - 1]!)}>{tCommon('back')}</Button>
      <div className={styles.finalActions}>
        <Button loading={registration.pending} onClick={() => void save(false)}>
          {t('saveDraft')}
        </Button>
        <Button type="primary" htmlType="submit" loading={registration.pending}>
          {t('finish')}
        </Button>
      </div>
    </>
  ) : (
    <>
      {vehicleIndex > 0 ? (
        <Button onClick={() => setStep(STEP_KEYS[vehicleIndex - 1]!)}>{tCommon('back')}</Button>
      ) : (
        <Link href={vehicleListPathFor(source)}>
          <Button icon={<ArrowLeftOutlined />}>{t('exit')}</Button>
        </Link>
      )}
      <Button type="primary" htmlType="submit">
        {tCommon('next')}
      </Button>
    </>
  );

  return (
    <Form component={false} layout="vertical" size="large" colon={false}>
      <form noValidate onSubmit={handleSubmit} className={styles.form}>
        <VehicleWizard
          steps={barSteps}
          current={barIndex}
          heading={steps[vehicleIndex]!.heading}
          footer={footer}
          onStepChange={(next) => {
            const key = barSteps[next]?.key;
            // Hồ sơ chủ xe chỉ tạo một lần; bấm lại ô đó trên thanh bước không có gì để làm.
            if (!key || key === OWNER_STEP_KEY) return;
            setStep(key as StepKey);
          }}
        >
          <div ref={headingRef} tabIndex={-1} className={styles.focusAnchor} />
          {stepError ? (
            <Alert type="error" showIcon title={stepError} className={styles.alert} role="alert" />
          ) : null}

          {step === 'info' ? (
            <QuickVehicleInfoStep control={control} setValue={setValue} vehicleType={vehicleType} />
          ) : null}
          {step === 'rental' ? (
            <QuickVehicleRentalStep
              control={control}
              setValue={setValue}
              vehicleType={vehicleType}
              branches={branches}
            />
          ) : null}
          {step === 'images' ? <QuickVehicleImagesStep control={control} /> : null}
        </VehicleWizard>
      </form>
      {/* Xe đã tạo nhưng phần sau lỗi: nói rõ và cho lối đi tiếp, xem `QuickVehicleSuccess`. */}
      {registration.createdVehicle && !result ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={t('draftExists')}
          action={
            <Button
              size="small"
              onClick={() =>
                router.push(
                  source === VEHICLE_REGISTRATION_SOURCE.MANAGE
                    ? ROUTES.MANAGE.VEHICLES
                    : accountVehiclePath.manage(registration.createdVehicle!.id),
                )
              }
            >
              {t('manageVehicle')}
            </Button>
          }
        />
      ) : null}
    </Form>
  );
}
