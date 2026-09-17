'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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

import { presignVehicleImage } from '@/services/upload';

import { useQuickVehicleRegistration } from '../hooks';
import { QUICK_VEHICLE_DEFAULTS, missingEnergyFields, quickVehicleSchema } from '../schema';
import type { QuickVehicleValues } from '../schema';
import { QuickVehicleInfoStep } from './steps/QuickVehicleInfoStep';
import { QuickVehicleRentalStep } from './steps/QuickVehicleRentalStep';
import { QuickVehicleImagesStep } from './steps/QuickVehicleImagesStep';
import { QuickVehicleOwnerStep } from './steps/QuickVehicleOwnerStep';
import { QuickVehicleSuccess } from './QuickVehicleSuccess';
import { useOwnerProfileDraft, useQuickVehicleDraft } from '../use-draft';
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
  /*
   * Chưa có gian hàng thì KHÔNG hỏi `GET /branches`: câu trả lời chắc chắn là 403, và nó chỉ
   * làm bước 2 hiện một cảnh báo "không tải được chi nhánh" cho người chẳng có chi nhánh nào.
   */
  const branches = useActiveBranches(user?.tenant != null);
  const registration = useQuickVehicleRegistration();

  const resolver = useValidationResolver<QuickVehicleValues>(
    quickVehicleSchema,
    'ListYourVehicle.validation',
    // `quickVehicleSchema` pick phần lớn trường từ `vehicleFormSchema`, và mã lỗi của chúng
    // thuộc namespace của form xe — không có vế này thì chúng lọt ra giao diện ở dạng thô.
    'Vehicles.form.validation',
  );
  const { control, getValues, setValue, setError, trigger, formState } =
    useForm<QuickVehicleValues>({ resolver, defaultValues: QUICK_VEHICLE_DEFAULTS });

  const [step, setStep] = useState<StepKey>('info');
  /** Đang quay lại sửa hồ sơ ⇒ bước sẽ trở về sau khi lưu. `null` = không sửa. */
  const [ownerReturnStep, setOwnerReturnStep] = useState<StepKey | null>(null);
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
  /**
   * Gian hàng CHƯA tồn tại trên server — người này đang đăng ký chiếc xe đầu tiên.
   *
   * Khác `ownerProfile == null` (đã khai chưa) và khác `canCreate` (có quyền chưa): đây là câu
   * hỏi "server đã có gì chưa", và nó quyết định cả ba thứ — không gọi `GET /branches`, không
   * validate `branchId`, không chặn vì thiếu quyền.
   */
  const pendingShop = user != null && user.tenant == null;
  /**
   * Hồ sơ chủ xe đã KHAI nhưng CHƯA gửi. `null` = chưa qua bước đó.
   *
   * Nguồn là nháp `sessionStorage`, không phải state React — nên F5 ở bước 2 không ném người
   * dùng về màn khai lại họ tên và địa chỉ. Nó là DỮ LIỆU trong máy họ, không phải một gian hàng
   * trên server, và đó là toàn bộ điểm của đợt sửa 17/09/2026 (xem `QuickVehicleOwnerStep`).
   */
  const ownerDraft = useOwnerProfileDraft(user?.id ?? null);
  const ownerProfile = ownerDraft.value;

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

  /**
   * Thanh bước có 4 mục khi luồng này phải đi qua hồ sơ chủ xe, 3 mục khi không.
   *
   * `ownerProfile != null` giữ mục đó lại trong lúc LƯU: `POST /tenants` làm mới `/auth/me`
   * giữa chừng, và nếu chỉ đọc `pendingShop` thì thanh bước co từ 4 xuống 3 ngay dưới tay
   * người dùng, "Thông tin xe" nhảy từ số 2 về số 1.
   */
  const withOwnerStep = pendingShop || ownerProfile != null;
  /** Lần chạy này là lần MỞ gian hàng — khác `pendingShop`, nó không đổi giữa chừng. */
  const opensShop = withOwnerStep;

  /**
   * Tải ảnh của người CHƯA có gian hàng: mở gian hàng ngay trước tấm đầu tiên.
   *
   * `/uploads/vehicle-images/presign` là tenant-scoped (khoá đối tượng nằm dưới
   * `tenants/<id>/vehicles`), nên không có gian hàng thì tấm ảnh đầu tiên nhận 403. Mở nó ở đúng
   * thao tác NÀY — chứ không phải ở nút "Tiếp tục" của bước trước — giữ nguyên nguyên tắc của
   * đợt sửa: server chỉ có dữ liệu khi người dùng thật sự làm một việc. Bỏ dở ở bước ảnh mà
   * chưa chọn tấm nào vẫn không để lại gì.
   */
  const presignImage = useCallback(
    async (file: File) => {
      if (opensShop) await registration.ensureShop(ownerProfile);
      return presignVehicleImage(file);
    },
    [opensShop, ownerProfile, registration],
  );

  const steps = useMemo(
    () =>
      STEP_KEYS.map((key) => ({
        key,
        title: t(`steps.${key}.title`),
        shortTitle: t(`steps.${key}.short`),
        heading: t(`steps.${key}.heading`),
        /*
         * `branchId` KHÔNG được validate khi wizard này là người MỞ gian hàng: chi nhánh mặc
         * định sinh ra cùng `POST /tenants` ở bước lưu, nên trước đó không có id nào để điền —
         * và bước 2 cũng không vẽ bộ chọn chi nhánh cho họ.
         *
         * Điều kiện đọc `ownerProfile` chứ không chỉ `pendingShop`: sau khi `POST /tenants`
         * chạy giữa chừng, `/auth/me` làm `pendingShop` thành `false` ngay trong lần chạy đó.
         * Nếu lúc ấy bước tạo xe hỏng và người dùng bấm lại, phép kiểm tra sẽ đòi một `branchId`
         * mà form chưa bao giờ có — và chặn đúng lần thử lại.
         */
        fields: opensShop ? STEP_FIELDS[key].filter((f) => f !== 'branchId') : STEP_FIELDS[key],
      })),
    [opensShop, t],
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
  if (pendingShop && (ownerProfile == null || ownerReturnStep != null)) {
    return (
      <QuickVehicleOwnerStep
        steps={barSteps}
        source={source}
        defaultValues={ownerProfile}
        submitLabel={ownerReturnStep ? tCommon('save') : undefined}
        onCompleted={(values) => {
          ownerDraft.save(values);
          // Quay lại đúng chỗ đã bấm "Sửa địa chỉ"; lần đầu thì đi tiếp sang bước xe.
          setStep(ownerReturnStep ?? 'info');
          setOwnerReturnStep(null);
        }}
      />
    );
  }
  /*
   * Quyền thêm xe đến CÙNG gian hàng, và gian hàng mở ở bước lưu — nên người đang đăng ký chiếc
   * xe đầu tiên chắc chắn chưa có `vehicle.create`. Chặn họ ở đây là chặn đúng luồng mà màn này
   * sinh ra để phục vụ; backend vẫn là lớp chặn thật nếu `POST /vehicles` không được phép.
   */
  if (!pendingShop && !canCreate) {
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
        s.fields.some((field) => formState.errors[field] || energyMissing.includes(field as never)),
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
        // Gian hàng mở ở CHÍNH lần bấm này khi người dùng chưa có — xem `useQuickVehicleRegistration`.
        ownerProfile,
      });
      draft.clear();
      ownerDraft.clear();
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
    const valid = await trigger([...(steps[vehicleIndex]?.fields ?? STEP_FIELDS[step])]);
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
            /*
             * Hồ sơ chủ xe quay lại SỬA được chừng nào gian hàng chưa được mở — sau đó nó là dữ
             * liệu trên server và sửa ở hồ sơ gian hàng, không phải trong wizard.
             */
            if (key === OWNER_STEP_KEY && pendingShop) {
              setOwnerReturnStep(step);
              return;
            }
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
              pendingAddress={pendingShop ? ownerProfile : null}
              onEditPendingAddress={() => setOwnerReturnStep('rental')}
            />
          ) : null}
          {step === 'images' ? (
            <QuickVehicleImagesStep control={control} presign={presignImage} />
          ) : null}
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
