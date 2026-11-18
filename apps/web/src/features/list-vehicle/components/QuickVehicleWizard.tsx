'use client';

import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Tag } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  PERMISSION,
  PUBLISH_REQUIREMENT,
  requiredVehicleImageTypes,
  type PublishRequirement,
} from '@xeprime/types';

import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PermissionState } from '@/components/feedback/PermissionState';
import {
  ROUTES,
  VEHICLE_REGISTRATION_SOURCE,
  ownerVehiclePath,
  vehicleListPathFor,
  type VehicleRegistrationSource,
} from '@/constants/routes';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { VehicleWizard, WizardSection } from '@/features/vehicles/components/VehicleWizard';
import {
  CreateVehicleAside,
  previewShopOf,
  type CreatePreviewValues,
  type CreateReadiness,
} from '@/features/vehicles/components/CreateVehicleAside';
import {
  CreateVehicleConfirmDialog,
  type CreateConfirmValues,
} from '@/features/vehicles/components/CreateVehicleConfirmDialog';
import {
  RegistrationFieldsBlock,
  RegistrationPhotoTile,
} from '@/features/vehicles/components/RegistrationCapture';
import formStyles from '@/features/vehicles/components/VehicleForm.module.css';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  type RegistrationCaptureState,
} from '@/features/vehicles/registration-capture';
import { branchLabel } from '@/features/branches/branch-label';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { usePermissions } from '@/hooks/use-permissions';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { presignVehicleImage } from '@/services/upload';

import { useQuickVehicleRegistration } from '../hooks';
import { usePublicationLabels } from '@/features/vehicles/hooks/use-publication-labels';
import { missingPublishRequirementsForForm } from '@/features/vehicles/publication';
import {
  QUICK_VEHICLE_DEFAULTS,
  QUICK_VEHICLE_FIXED,
  missingEnergyFields,
  quickVehicleSchema,
} from '../schema';
import type { QuickVehicleValues } from '../schema';
import { QuickVehicleInfoStep } from './steps/QuickVehicleInfoStep';
import { QuickVehicleRentalStep } from './steps/QuickVehicleRentalStep';
import { QuickVehicleImagesStep } from './steps/QuickVehicleImagesStep';
import { QuickVehicleFeaturesStep } from './steps/QuickVehicleFeaturesStep';
import { QuickVehicleOwnerStep } from './steps/QuickVehicleOwnerStep';
import { QuickVehicleSuccess } from './QuickVehicleSuccess';
import { useOwnerProfileDraft, useQuickVehicleDraft } from '../use-draft';
import styles from './QuickVehicleWizard.module.css';

/** Trường của từng bước — dùng để validate ĐÚNG bước đang mở và để đưa lỗi API về đúng chỗ. */
const STEP_FIELDS = {
  // Bước 1 theo Figma 17/11/2026: ẢNH xe (+ cà vẹt, state riêng) đứng đầu, rồi thông tin xe.
  info: [
    'images',
    'media',
    'vehicleType',
    'plateNumber',
    'name',
    'brand',
    'model',
    'vehicleCatalogModelId',
    'seatCount',
    'bodyType',
    'manufactureYear',
    'color',
    'fuelType',
    'transmission',
    'fuelConsumptionCombined',
    'electricRangeKm',
    'batteryCapacityKwh',
    'electricConsumptionKwhPer100Km',
    'engineDisplacementCc',
    // Thiếu từ trước (lỗi phân khúc xe máy không dẫn về bước nào) - thêm cùng đợt 17/11/2026.
    'motorbikeCategory',
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
  features: ['features', 'description'],
} as const satisfies Record<string, ReadonlyArray<keyof QuickVehicleValues>>;

const STEP_KEYS = ['info', 'rental', 'features'] as const;

/**
 * Điều kiện lên chợ thuộc BƯỚC nào (30/09/2026) — thiếu thì chặn đúng bước đó và đưa người dùng
 * về đúng chỗ. Xe tạo qua wizard phải ĐỦ điều kiện lên chợ: không còn "lưu nháp thiếu ảnh" rồi để
 * lại một danh sách việc cần làm ở hồ sơ xe.
 */
const REQUIREMENT_STEP: Record<PublishRequirement, (typeof STEP_KEYS)[number]> = {
  [PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]: 'rental',
  [PUBLISH_REQUIREMENT.LONG_TERM_PRICE]: 'rental',
  [PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE]: 'rental',
  [PUBLISH_REQUIREMENT.PHOTOS]: 'info',
  [PUBLISH_REQUIREMENT.PLATE_NUMBER]: 'info',
  [PUBLISH_REQUIREMENT.IDENTITY]: 'info',
  [PUBLISH_REQUIREMENT.ENERGY_SPEC]: 'info',
  [PUBLISH_REQUIREMENT.BRANCH_LOCATION]: 'rental',
};
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
  const { formGaps } = usePublicationLabels();
  const tOwner = useTranslations('ListYourVehicle.ownerProfile');
  const tCommon = useTranslations('Common.actions');
  // Chữ dùng chung với wizard nâng cao (tiêu đề thẻ, thông báo thiếu, nút Gửi duyệt) - một bản dịch.
  const tVehicleWizard = useTranslations('Vehicles.form.wizard');
  const tSteps = useTranslations('Vehicles.form.createSteps');
  const tBranches = useTranslations('Branches');
  const { message, notification } = App.useApp();
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
  const { control, getValues, getFieldState, setValue, setError, trigger, formState } =
    // `onChange`: lỗi đỏ tự mất ngay khi ô được sửa đúng - wizard đi bước bằng `trigger`.
    useForm<QuickVehicleValues>({ resolver, defaultValues: QUICK_VEHICLE_DEFAULTS, mode: 'onChange' });

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

  /*
   * Cà vẹt (ADR 0099) — BẮT BUỘC khi đăng xe nhanh, mọi loại xe. Presign cà vẹt cũng tenant-scoped
   * nên người chưa có gian hàng mở gian hàng ngay trước lượt tải, y như tấm ảnh xe đầu tiên.
   */
  const [regCapture, setRegCapture] = useState<RegistrationCaptureState>(EMPTY_REGISTRATION);
  const [regShowErrors, setRegShowErrors] = useState(false);
  const plateNumber = useWatch({ control, name: 'plateNumber' });
  const regCheck = checkRegistration(regCapture, plateNumber);
  const regBlocked = !regCheck.ok;
  const regPreviewUrl = regCapture.previewUrl;
  useEffect(
    () => () => {
      if (regPreviewUrl) URL.revokeObjectURL(regPreviewUrl);
    },
    [regPreviewUrl],
  );
  const ensureShopBeforeUpload = useCallback(async () => {
    if (opensShop) await registration.ensureShop(ownerProfile);
  }, [opensShop, ownerProfile, registration]);

  /*
   * Cột phải (Figma): xem trước trên chợ + "Sẵn sàng gửi duyệt". Đọc CÙNG luật với cổng lưu (điều
   * kiện lên chợ, năng lượng, cà vẹt) chỉ để chủ xe thấy còn thiếu gì.
   */
  const watched = useWatch({ control });
  const shopQuery = useMyShop(!pendingShop);
  const branchItems = branches.data?.items;
  const selectedBranch = branchItems?.find((b) => b.id === branchId) ?? null;
  const branchText = selectedBranch ? branchLabel(selectedBranch, tBranches('labels.noProvince')) : null;
  const readiness: CreateReadiness = useMemo(() => {
    const values = { ...QUICK_VEHICLE_DEFAULTS, ...watched } as QuickVehicleValues;
    const gaps = missingPublishRequirementsForForm({
      ...values,
      serviceTypes: QUICK_VEHICLE_FIXED.serviceTypes,
    });
    const media = values.media ?? [];
    return {
      photos:
        requiredVehicleImageTypes(values.vehicleType).every((slot) =>
          media.some((item) => item.type === slot),
        ) && !regCheck.errors.photo,
      // Ảnh cà vẹt chỉ cần CÓ (máy đọc ra hay không không tính); tên chủ xe / số khung / số máy là
      // ô nhập của mục thông tin (18/11/2026).
      info:
        Boolean(values.name?.trim()) &&
        Object.keys(regCheck.errors).every((key) => key === 'photo') &&
        missingEnergyFields(values).length === 0 &&
        !gaps.some((gap) => REQUIREMENT_STEP[gap] === 'info' && gap !== PUBLISH_REQUIREMENT.PHOTOS),
      pricing: !gaps.some((gap) => REQUIREMENT_STEP[gap] === 'rental'),
      features: (values.features ?? []).length > 0 || Boolean(values.description?.trim()),
    };
  }, [watched, regCheck.errors]);
  const previewValues: CreatePreviewValues = {
    ...watched,
    discountPercent: watched.discountEnabled ? (watched.discountPercent ?? null) : null,
  };
  const [confirmOpen, setConfirmOpen] = useState(false);

  const steps = useMemo(
    () =>
      STEP_KEYS.map((key) => ({
        key,
        title: t(`steps.${key}.title`),
        shortTitle: t(`steps.${key}.short`),
        heading: t(`steps.${key}.heading`),
        description: t(`steps.${key}.description`),
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

  /** Điều kiện lên chợ còn thiếu — CÙNG luật với cổng gửi duyệt ở backend. */
  function publishGaps(): PublishRequirement[] {
    return missingPublishRequirementsForForm({
      ...getValues(),
      serviceTypes: QUICK_VEHICLE_FIXED.serviceTypes,
    });
  }

  function publishError(keys: readonly PublishRequirement[]): string {
    return t('errors.publishRequired', { items: formGaps(keys, getValues()) });
  }

  /** Figma `24352:69368`: thiếu thông tin khi lưu/gửi → thông báo góc phải (kèm dải lỗi đầu bước). */
  function warnMissing() {
    notification.warning({
      title: tVehicleWizard('missingTitle'),
      description: tVehicleWizard('missingBody'),
      placement: 'topRight',
    });
  }

  /**
   * Cổng chung trước MỌI lượt lưu (nháp hay gửi duyệt) - đúng luật cũ, cộng cà vẹt (ADR 0099).
   * `false` ⇒ đã đưa người dùng về đúng bước và nói lý do.
   */
  async function validateAll(): Promise<boolean> {
    const ok = await validateAllInner();
    if (!ok) {
      setConfirmOpen(false);
      warnMissing();
    }
    return ok;
  }

  /** "Gửi duyệt" ở bước cuối mở HỘP xác nhận khi mọi cổng đã qua. */
  async function openConfirm() {
    if (await validateAll()) setConfirmOpen(true);
  }

  async function validateAllInner(): Promise<boolean> {
    setStepError(null);
    const valid = await trigger(steps.flatMap((s) => [...s.fields]));
    const energyMissing = missingEnergyFields(getValues());
    const publishMissing = publishGaps();
    if (valid && energyMissing.length === 0 && publishMissing.length > 0) {
      setStep(REQUIREMENT_STEP[publishMissing[0]!]);
      setStepError(publishError(publishMissing));
      headingRef.current?.focus();
      return false;
    }
    if (!valid || energyMissing.length > 0) {
      /*
       * Đưa người dùng về đúng bước chứa lỗi. Đọc lỗi bằng `getFieldState` — `formState.errors`
       * trong closure này là ảnh chụp của lần render TRƯỚC `trigger`, nên lần bấm đầu từng nhảy
       * nhầm về bước 1 và phải bấm lần hai mới dừng đúng ở bước ảnh.
       */
      const target = steps.find((s) =>
        s.fields.some(
          (field) => getFieldState(field).error || energyMissing.includes(field as never),
        ),
      );
      if (target) setStep(target.key);
      if (energyMissing.length > 0) {
        setStepError(publishError([PUBLISH_REQUIREMENT.ENERGY_SPEC]));
      } else if (target) {
        // Thông báo ở đầu bước như bước 1 — vd bước ảnh: "Ảnh đại diện, Tối thiểu 4 ảnh".
        const targetGaps = publishMissing.filter((key) => REQUIREMENT_STEP[key] === target.key);
        if (targetGaps.length > 0) setStepError(publishError(targetGaps));
      }
      headingRef.current?.focus();
      return false;
    }
    // Cà vẹt (ADR 0099): chưa có ảnh / thiếu ô bắt buộc / biển lệch ⇒ về bước 1, hiện lỗi tại ô.
    // Xe đã tạo ở lượt trước (thử lại) thì cà vẹt đã gắn, không đòi lại.
    if (regBlocked && !registration.createdVehicle) {
      setRegShowErrors(true);
      setStep('info');
      headingRef.current?.focus();
      return false;
    }
    return true;
  }

  async function persist(submitForReview: boolean) {
    try {
      const outcome = await registration.run(getValues(), {
        submitForReview,
        toMessage: errorMessage,
        // Gian hàng mở ở CHÍNH lần bấm này khi người dùng chưa có — xem `useQuickVehicleRegistration`.
        ownerProfile,
        registration: regCheck.ok ? regCheck.input : undefined,
      });
      setConfirmOpen(false);
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
      setConfirmOpen(false);
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
      void openConfirm();
      return;
    }
    setStepError(null);
    const valid = await trigger([...(steps[vehicleIndex]?.fields ?? STEP_FIELDS[step])]);
    const energyMissing = step === 'info' ? missingEnergyFields(getValues()) : [];
    const regGap = step === 'info' && regBlocked && !registration.createdVehicle;
    if (regGap) setRegShowErrors(true);
    if (!valid || energyMissing.length > 0 || regGap) {
      if (energyMissing.length > 0) setStepError(publishError([PUBLISH_REQUIREMENT.ENERGY_SPEC]));
      return;
    }
    const stepMissing = publishGaps().filter((key) => REQUIREMENT_STEP[key] === step);
    if (stepMissing.length > 0) {
      setStepError(publishError(stepMissing));
      return;
    }
    setStep(STEP_KEYS[vehicleIndex + 1]!);
    headingRef.current?.focus();
  }

  /** Hàng nút cuối trang (Figma): "← Quay lại" · "Tiếp tục →" · "Gửi duyệt →"; bước 1 có "Thoát". */
  /** Nút đi tiếp của bước - vàng thương hiệu; lặp ở cuối nội dung (`endAction`). */
  const forward = (
    <Button
      type="primary"
      htmlType="submit"
      loading={isLastStep ? registration.pending : false}
      icon={<ArrowRightOutlined aria-hidden="true" />}
      iconPlacement="end"
    >
      {isLastStep ? tVehicleWizard('submit') : tCommon('next')}
    </Button>
  );

  const footer = (
    <>
      {vehicleIndex > 0 ? (
        <Button
          onClick={() => setStep(STEP_KEYS[vehicleIndex - 1]!)}
          icon={<ArrowLeftOutlined aria-hidden="true" />}
        >
          {tCommon('back')}
        </Button>
      ) : (
        <Link href={vehicleListPathFor(source)} className={styles.footerStart}>
          <Button icon={<ArrowLeftOutlined aria-hidden="true" />}>{t('exit')}</Button>
        </Link>
      )}
      {forward}
    </>
  );

  const confirmValues: CreateConfirmValues = {
    ...getValues(),
    serviceTypes: [...QUICK_VEHICLE_FIXED.serviceTypes],
    sourceType: QUICK_VEHICLE_FIXED.sourceType,
    discountPercent: getValues('discountEnabled') ? getValues('discountPercent') : null,
  } as CreateConfirmValues;

  return (
    <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
      <form noValidate onSubmit={handleSubmit} className={styles.form}>
        <VehicleWizard
          steps={barSteps}
          current={barIndex}
          plain
          footer={footer}
          aside={
            <CreateVehicleAside
              preview={previewValues}
              readiness={readiness}
              branchLabel={branchText}
              shop={previewShopOf(shopQuery.data)}
              requiredPhotos={requiredVehicleImageTypes(vehicleType).length}
            />
          }
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
          notice={
            <>
              <div ref={headingRef} tabIndex={-1} className={styles.focusAnchor} />
              {stepError ? (
                <Alert type="error" showIcon title={stepError} className={styles.alert} role="alert" />
              ) : null}
            </>
          }
        >
          {step === 'info' ? (
            <>
              <WizardSection
                id="quick-vehicle-photos"
                title={tSteps('photosTitle')}
                description={tSteps('photosDescription')}
                badge={
                  <Tag className={styles.requiredBadge}>
                    {tSteps('photosRequired', {
                      count: requiredVehicleImageTypes(vehicleType).length,
                    })}
                  </Tag>
                }
              >
                <QuickVehicleImagesStep
                  control={control}
                  presign={presignImage}
                  extraTiles={
                    <RegistrationPhotoTile
                      state={regCapture}
                      onChange={setRegCapture}
                      vehiclePlate={plateNumber}
                      showErrors={regShowErrors}
                      beforeUpload={ensureShopBeforeUpload}
                    />
                  }
                />
              </WizardSection>
              <WizardSection
                id="quick-vehicle-info"
                title={tSteps('infoTitle')}
                description={tSteps('infoDescription')}
              >
                <div className={formStyles.threeColumnFields}>
                  <RegistrationFieldsBlock
                    state={regCapture}
                    onChange={setRegCapture}
                    vehiclePlate={plateNumber}
                    showErrors={regShowErrors}
                  />
                  <QuickVehicleInfoStep
                    control={control}
                    setValue={setValue}
                    vehicleType={vehicleType}
                  />
                </div>
              </WizardSection>
            </>
          ) : null}
          {step === 'rental' ? (
            <WizardSection
              id="quick-vehicle-rental"
              title={steps[vehicleIndex]!.title}
              description={steps[vehicleIndex]!.description}
            >
              <QuickVehicleRentalStep
                control={control}
                setValue={setValue}
                vehicleType={vehicleType}
                branches={branches}
                pendingAddress={pendingShop ? ownerProfile : null}
                onEditPendingAddress={() => setOwnerReturnStep('rental')}
              />
            </WizardSection>
          ) : null}
          {step === 'features' ? (
            <WizardSection
              id="quick-vehicle-features"
              title={tSteps('featuresTitle')}
              description={tSteps('featuresDescription')}
            >
              <QuickVehicleFeaturesStep control={control} vehicleType={vehicleType} />
            </WizardSection>
          ) : null}
        </VehicleWizard>
      </form>

      <CreateVehicleConfirmDialog
        open={confirmOpen}
        values={confirmValues}
        branchLabel={branchText}
        registration={{
          chassisNumber: regCapture.fields.chassisNumber,
          engineNumber: regCapture.fields.engineNumber,
        }}
        submitting={registration.pending}
        onClose={() => setConfirmOpen(false)}
        onSaveDraft={() => void persist(false)}
        onSubmit={() => void persist(true)}
      />

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
                    : ownerVehiclePath.manage(registration.createdVehicle!.id),
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
