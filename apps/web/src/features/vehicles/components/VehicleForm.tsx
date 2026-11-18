'use client';

import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form } from 'antd';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import {
  PUBLISH_REQUIREMENT,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
  requiredVehicleImageTypes,
  type PublishRequirement,
} from '@xeprime/types';
import { vehicleCreateFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { HelpAsTipProvider } from '@/components/form/help-as-tip';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useCreateWizardSteps, type CreateWizardStepKey } from './VehicleFormSections';
import { CreateVehicleFeaturesStep, CreateVehicleInfoStep } from './CreateVehicleSteps';
import {
  CreateVehicleAside,
  previewShopOf,
  shopListingGaps,
  type CreateReadiness,
} from './CreateVehicleAside';
import { CreateVehicleConfirmDialog } from './CreateVehicleConfirmDialog';
import { VehicleWizard } from './VehicleWizard';
import { CreateVehiclePricingStep } from './CreateVehiclePricingStep';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { branchLabel } from '@/features/branches/branch-label';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import styles from './VehicleForm.module.css';
import { usePublicationLabels } from '../hooks/use-publication-labels';
import { useComposedVehicleName } from '../hooks/use-composed-vehicle-name';
import { useAutofillCatalogRent } from '../hooks/use-autofill-catalog-rent';
import { useApplyRegistrationReading } from '../hooks/use-registration-autofill';
import { missingPublishRequirementsForForm, publishGapFields } from '../publication';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { EMPTY_REGISTRATION, checkRegistration, type RegistrationCaptureState } from '../registration-capture';
import {
  clearVehicleCreateDraft,
  readVehicleCreateDraft,
  writeVehicleCreateDraft,
  type VehicleCreateDraft,
} from '../use-create-draft';
import type { CreateVehicleRegistrationInput } from '../types';

/** Mặc định khi tạo mới: chọn sẵn giá trị hợp lệ để select bắt buộc không rỗng. */
const EMPTY_DEFAULTS: VehicleFormValues = {
  code: '',
  name: '',
  // Chọn sẵn ở runtime bằng chi nhánh MẶC ĐỊNH của gian hàng (xem `useEffect` bên dưới) — hằng số
  // này không thể biết id chi nhánh của một gian hàng cụ thể.
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
  insuredValue: null,
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

export interface VehicleSubmitOptions {
  /** Bấm "Gửi duyệt" thay vì "Lưu nháp" — trang quyết định gọi thêm `submit-public`. */
  submitForReview: boolean;
  /** Cà vẹt đã chụp + xác nhận (ADR 0089) — chỉ ô tô, ngoài phiên hỗ trợ. */
  registration?: CreateVehicleRegistrationInput;
  /**
   * Bật "Tự động đồng ý nhận chuyến" cho dịch vụ TỰ LÁI — trang ghi bằng
   * `patchVehicleServiceSetting` sau khi xe đã tạo (cùng đường với luồng đăng nhanh).
   */
  autoAcceptEnabled?: boolean;
}

interface VehicleFormProps {
  submitting: boolean;
  errorMessage?: string | null;
  /**
   * NÉM lại lỗi API để wizard gắn được lỗi cấp trường vào đúng ô (và nhảy về bước chứa nó).
   * Nuốt lỗi ở phía trang thì người dùng chỉ còn một toast chung trên một form 30 ô.
   */
  onSubmit: (values: VehicleFormValues, options: VehicleSubmitOptions) => void | Promise<void>;
  onCancel: () => void;
  /**
   * Chủ xe tuyến HOA HỒNG (18/11/2026 - một wizard cho hai tuyến): ẩn chi nhánh (họ chỉ có chi nhánh
   * mặc định, điền ngầm), nguồn xe (trục tài chính của gói) và khối chính sách gian hàng (họ đặt
   * chính sách trên TỪNG xe ở màn sửa xe - ADR 0085 điều 3).
   */
  commission?: boolean;
  /** Khoá nháp `sessionStorage` (`vehicleCreateDraftKey`); `null` = không giữ nháp (phiên hỗ trợ). */
  draftKey?: string | null;
}

/** Điều kiện lên chợ thuộc BƯỚC nào của wizard — thiếu thì chặn đúng bước đó. */
const REQUIREMENT_STEP: Record<PublishRequirement, CreateWizardStepKey> = {
  [PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]: 'pricing',
  [PUBLISH_REQUIREMENT.LONG_TERM_PRICE]: 'pricing',
  [PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE]: 'pricing',
  // Ảnh nằm ở bước 1 theo Figma 17/11/2026 ("Ảnh xe" là thẻ đầu tiên).
  [PUBLISH_REQUIREMENT.PHOTOS]: 'basic',
  [PUBLISH_REQUIREMENT.PLATE_NUMBER]: 'basic',
  [PUBLISH_REQUIREMENT.IDENTITY]: 'basic',
  [PUBLISH_REQUIREMENT.ENERGY_SPEC]: 'basic',
  [PUBLISH_REQUIREMENT.BRANCH_LOCATION]: 'basic',
};

/**
 * Wizard tạo xe — Figma `24352:70390` (17/11/2026): 3 bước Thông tin xe → Dịch vụ & giá → Tiện ích &
 * mô tả, cột phải "Xem trước trên Marketplace" + "Sẵn sàng gửi duyệt", và HỘP xác nhận thay bước
 * "Xác nhận" cũ. Route chỉnh sửa dùng `VehicleEditWorkspace`, không đi qua wizard này.
 *
 * ⚠️ Wizard là **thuần client**: mọi bước giữ giá trị trong cùng một form React Hook Form và chỉ
 * gọi API **một lần** khi lưu. Backend không có endpoint lưu từng phần, nên không chỗ nào ở đây
 * được nói "đã lưu nháp" giữa chừng.
 */
export function VehicleForm({
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
  commission = false,
  draftKey = null,
}: VehicleFormProps) {
  /*
   * Nháp đọc ĐỒNG BỘ một lần lúc mount (form chỉ dựng ở client, sau khi `/auth/me` về) để giá trị
   * khôi phục là `defaultValues` - không có khung trống nháy rồi mới điền, và các effect điền sẵn
   * (chi nhánh mặc định) thấy ngay ô đã có giá trị.
   */
  const [draft] = useState(() => (draftKey ? readVehicleCreateDraft(draftKey) : null));
  // Phiên hỗ trợ tạo xe NHÁP (ADR 0050 §13): gửi duyệt là thao tác riêng, có lý do + xác nhận hai lần.
  const draftOnly = useSupportHides(SUPPORT_HIDDEN_AREA.CREATE_AND_SUBMIT);
  // Không chọn hình thức nguồn xe (trục tài chính) — xe nháp giữ mặc định "Sở hữu".
  const sourceHidden = useSupportHides(SUPPORT_HIDDEN_AREA.VEHICLE_SOURCE) || commission;
  const t = useTranslations('Vehicles.form');
  const { formGaps } = usePublicationLabels();
  const tCommon = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const { notification } = App.useApp();
  const tShopGate = useTranslations('Shop.listingGate');

  const applyApiFieldErrors = useApiFieldErrors();
  const baseResolver = useValidationResolver<VehicleFormValues>(
    vehicleCreateFormSchema,
    'Vehicles.form.validation',
  );
  const steps = useCreateWizardSteps();
  /*
   * Bước người dùng ĐÃ bấm "Tiếp tục"/"Gửi duyệt" (18/11/2026). Form validate theo `onChange` để lỗi tự
   * mất khi sửa, nhưng trước lần bấm đầu tiên của một bước thì không được mắng: tải tấm ảnh đầu tiên
   * mà đã hiện "thiếu ảnh" là báo lỗi cho việc người dùng đang làm dở. Resolver lọc bỏ lỗi của các
   * ô thuộc bước chưa bấm; lượt gửi cuối đánh dấu mọi bước nên không lỗi nào lọt.
   */
  const attemptedSteps = useRef(new Set<string>());
  const resolver = useMemo<typeof baseResolver>(() => {
    const stepOf = new Map<string, string>();
    for (const candidate of steps) for (const field of candidate.fields) stepOf.set(field, candidate.key);
    return async (values, context, options) => {
      const result = await baseResolver(values, context, options);
      const entries = Object.entries(result.errors ?? {});
      if (entries.length === 0) return result;
      const kept = entries.filter(([field]) => {
        const key = stepOf.get(field);
        return !key || attemptedSteps.current.has(key);
      });
      if (kept.length === entries.length) return result;
      if (kept.length === 0) return { values, errors: {} };
      return { values: {}, errors: Object.fromEntries(kept) } as typeof result;
    };
  }, [baseResolver, steps]);
  const markAllStepsAttempted = () => {
    for (const candidate of steps) attemptedSteps.current.add(candidate.key);
  };

  const {
    control,
    handleSubmit,
    setError,
    setValue,
    trigger,
    getValues,
    formState: { errors, isDirty },
  } = useForm<VehicleFormValues>({
    resolver,
    // Kiểm lại ô NGAY khi người dùng sửa (18/11/2026): wizard đi bước bằng `trigger` chứ không qua
    // `handleSubmit`, nên chế độ mặc định `onSubmit` giữ lỗi đỏ tới lần bấm lưu kế tiếp.
    mode: 'onChange',
    defaultValues: draft ? { ...EMPTY_DEFAULTS, ...draft.values } : EMPTY_DEFAULTS,
  });

  const lastStep = steps.length - 1;
  const [step, setStep] = useState(() => Math.min(Math.max(draft?.step ?? 0, 0), lastStep));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(draft?.autoAcceptEnabled ?? false);

  /**
   * Chi nhánh: điền sẵn một giá trị để thao tác vẫn một bước như trước, nhưng vẫn là một trường
   * thật trên form — người dùng thấy xe sẽ nằm ở đâu và đổi được ngay tại đây.
   *
   * Thứ tự ưu tiên: `?branchId=` trên URL (ADR 0052) → chi nhánh mặc định → chi nhánh đầu tiên.
   * Chỉ điền khi ô còn trống; giá trị lạ trên URL không nằm trong danh sách nên rơi về nhánh sau.
   */
  const branches = useActiveBranches();
  const branchId = useWatch({ control, name: 'branchId' });
  const noProvince = tBranches('labels.noProvince');
  const intendedBranchId = useSearchParams().get('branchId');
  const branchOptions = useMemo(
    () =>
      (branches.data?.items ?? []).map((b) => ({ value: b.id, label: branchLabel(b, noProvince) })),
    [branches.data, noProvince],
  );
  useEffect(() => {
    if (branchId) return;
    const items = branches.data?.items;
    if (!items) return;
    const preferred =
      items.find((b) => b.id === intendedBranchId) ?? items.find((b) => b.isDefault) ?? items[0] ?? null;
    if (preferred) setValue('branchId', preferred.id, { shouldValidate: true });
  }, [branchId, branches.data, intendedBranchId, setValue]);
  const selectedBranchLabel = branchOptions.find((o) => o.value === branchId)?.label ?? null;
  const selectedBranch = branches.data?.items.find((b) => b.id === branchId) ?? null;
  /*
   * Chủ xe tuyến hoa hồng MỘT chi nhánh: không có gì để chọn ⇒ thay ô chọn bằng "Địa chỉ nhận xe"
   * (đọc + sửa). Có từ hai chi nhánh trở lên thì vẫn là ô chọn như gian hàng.
   */
  const branchHidden = commission && branchOptions.length <= 1;
  const shop = useMyShop(true);
  /** Hồ sơ gian hàng còn thiếu để gửi duyệt (tuyến gói) - `null` = không áp dụng. */
  const shopGaps = useMemo(() => shopListingGaps(shop.data), [shop.data]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  // Kiểu dáng thân xe chỉ có nghĩa với ô tô. Nguồn năng lượng cũng phụ thuộc loại phương tiện:
  // xe máy chỉ nhận xăng/điện, nên đổi từ ô tô dầu/hybrid phải xoá lựa chọn không còn hợp lệ.
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  // Chọn mẫu xe ⇒ tự điền giá tham khảo vào ô giá còn trống (tự lái · có tài · dài hạn).
  useAutofillCatalogRent(control, getValues, setValue);

  /*
   * Cà vẹt (ADR 0089 · 0099) — BẮT BUỘC khi thêm MỌI loại xe. Phiên hỗ trợ không có ô này: nhân sự
   * nền tảng không tải giấy tờ thay chủ xe (server cũng chặn).
   */
  const registrationRequired = !draftOnly;
  const [registration, setRegistration] = useState<RegistrationCaptureState>(() => {
    const saved = draft?.registration;
    if (!saved) return EMPTY_REGISTRATION;
    /*
     * Có đủ ảnh (data URL) + mã lượt tải ⇒ khôi phục trọn: ảnh, kết quả đọc, ba ô. Nháp cũ thiếu ảnh
     * ⇒ chỉ giữ ba ô (không để ô ảnh trống mà vẫn báo "Đã quét…").
     */
    if (saved.uploadId && saved.previewUrl?.startsWith('data:')) {
      return { ...EMPTY_REGISTRATION, ...saved, phase: 'ready' };
    }
    return { ...EMPTY_REGISTRATION, fields: saved.fields, editing: true };
  });
  const [registrationShowErrors, setRegistrationShowErrors] = useState(false);
  // Lượt đọc cà vẹt mới ⇒ điền biển số + màu sơn (ADR 0102).
  // Lượt đọc KHÔI PHỤC từ nháp không điền lại biển số/màu: form đã mang giá trị (có thể đã sửa tay).
  const [restoredReading] = useState(registration.reading);
  useApplyRegistrationReading(
    registration.reading === restoredReading ? null : registration.reading,
    setValue,
  );
  const plateNumber = useWatch({ control, name: 'plateNumber' });
  const registrationCheck = checkRegistration(registration, plateNumber);
  const registrationBlocked = registrationRequired && !registrationCheck.ok;
  // Thu hồi ảnh xem trước khi rời wizard — object URL giữ cả tấm ảnh trong bộ nhớ trình duyệt.
  const previewUrl = registration.previewUrl;
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, isCar, setValue, vehicleType]);

  // "Giá hiển thị trên sàn" đã bỏ khỏi wizard (18/11/2026, người dùng chốt) - thẻ xem trước bên phải
  // đã hiện giá sau giảm.

  /**
   * Điều kiện lên chợ còn thiếu (30/09/2026) — xe tạo qua wizard phải ĐỦ điều kiện lên chợ, CÙNG
   * luật với cổng gửi duyệt ở backend. Chặn ở bước chứa nó; phiên hỗ trợ (chỉ lưu nháp, không có
   * đường gửi duyệt) không bị chặn.
   */
  const [publishMissing, setPublishMissing] = useState<PublishRequirement[]>([]);
  function publishGaps(stepKey?: CreateWizardStepKey): PublishRequirement[] {
    if (draftOnly) return [];
    const missing = missingPublishRequirementsForForm(getValues());
    return stepKey ? missing.filter((key) => REQUIREMENT_STEP[key] === stepKey) : missing;
  }

  const currentKey = steps[step]!.key as CreateWizardStepKey;

  /** Lỗi của RIÊNG bước đang mở — dùng cho dải tổng hợp đầu bước. */
  const stepErrors =
    steps[step]!.fields.filter((field) => errors[field]).length +
    (currentKey === 'basic' && registrationRequired && registrationShowErrors
      ? Object.keys(registrationCheck.errors).length
      : 0);

  /** Mọi ô nhập wizard thật sự có — bộ lọc cho lỗi cấp trường mà server trả về. */
  const wizardFields = useMemo(() => steps.flatMap((s) => [...s.fields]), [steps]);

  /** Đưa người dùng về bước chứa lỗi đầu tiên — dùng chung cho lỗi yup và lỗi từ server. */
  function goToStepWithError(hasError: (field: keyof VehicleFormValues) => boolean) {
    const target = steps.findIndex((candidate) => candidate.fields.some(hasError));
    if (target >= 0) setStep(target);
  }

  /**
   * Đánh dấu ĐỎ từng ô còn thiếu điều kiện lên chợ, ngay tại ô (người dùng chốt 18/11/2026) - dải
   * tổng hợp đầu trang thôi thì không biết ô nào. Lỗi tự mất khi ô được điền (RHF validate lại).
   */
  function flagPublishGaps(missing: readonly PublishRequirement[]) {
    const values = getValues();
    const message = t('wizard.requiredForPublish');
    for (const requirement of missing) {
      const direct = {
        [PUBLISH_REQUIREMENT.PLATE_NUMBER]: 'plateNumber',
        [PUBLISH_REQUIREMENT.SELF_DRIVE_PRICE]: 'weekdayPrice',
        [PUBLISH_REQUIREMENT.LONG_TERM_PRICE]: 'monthlyPrice',
        [PUBLISH_REQUIREMENT.WITH_DRIVER_PRICE]: 'withDriverDailyPrice',
      } as const satisfies Partial<Record<PublishRequirement, keyof VehicleFormValues>>;
      const field = direct[requirement as keyof typeof direct];
      if (field) setError(field, { type: 'publish', message });
      for (const field of publishGapFields(requirement, values)) {
        // Dòng xe chọn bằng id danh mục - lỗi gắn vào đúng ô chọn đó.
        setError(field === 'model' ? 'vehicleCatalogModelId' : field, { type: 'publish', message });
      }
    }
  }

  function goToStep(key: CreateWizardStepKey) {
    const target = steps.findIndex((candidate) => candidate.key === key);
    if (target >= 0) setStep(target);
  }

  /** Figma `24352:69368`: thiếu thông tin khi lưu/gửi → thông báo góc phải + nhảy về đúng bước. */
  function warnMissing() {
    notification.warning({
      title: t('wizard.missingTitle'),
      description: t('wizard.missingBody'),
      placement: 'topRight',
    });
  }

  /**
   * Cổng chung trước MỌI lượt lưu (nháp hay gửi duyệt) — y như trước khi đổi giao diện: thiếu điều
   * kiện lên chợ hoặc cà vẹt thì nhảy về bước chứa nó, không gọi API.
   */
  function passesPreSubmitGates(): boolean {
    markAllStepsAttempted();
    const missing = publishGaps();
    setPublishMissing(missing);
    flagPublishGaps(missing);
    if (missing.length > 0) {
      goToStep(REQUIREMENT_STEP[missing[0]!]);
      warnMissing();
      return false;
    }
    if (registrationBlocked) {
      setRegistrationShowErrors(true);
      goToStep('basic');
      warnMissing();
      return false;
    }
    return true;
  }

  function submitNow(options: Pick<VehicleSubmitOptions, 'submitForReview'>) {
    if (!passesPreSubmitGates()) {
      setConfirmSubmit(false);
      return;
    }
    /*
     * Gửi duyệt mà hồ sơ gian hàng (tuyến gói) còn thiếu ⇒ server sẽ từ chối SAU khi đã tạo xe.
     * Chặn trước, nói rõ thiếu gì + lối tới hồ sơ gian hàng; "Lưu nháp" vẫn đi được (18/11/2026).
     */
    if (options.submitForReview && !draftOnly && shopGaps && shopGaps.length > 0) {
      notification.warning({
        title: tShopGate('title'),
        description: (
          <>
            {shopGaps.map((gap) => tShopGate(`items.${gap}`)).join(', ')}.{' '}
            <a href={ROUTES.MANAGE.SHOP} target="_blank" rel="noopener noreferrer">
              {tShopGate('cta')}
            </a>
          </>
        ),
        placement: 'topRight',
      });
      return;
    }
    const serviceTypes = getValues('serviceTypes') ?? [];
    const full: VehicleSubmitOptions = {
      ...options,
      ...(registrationRequired ? { registration: registrationCheck.input } : {}),
      autoAcceptEnabled:
        !draftOnly && autoAcceptEnabled && serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE),
    };
    void handleSubmit(
      async (formValues) => {
        try {
          await onSubmit(formValues, full);
        } catch (err) {
          /*
           * Server bắt được thứ yup bỏ lọt (luật chỉ có ở backend: số chữ số thập phân, độ dài…)
           * → gắn vào đúng ô và nhảy về bước chứa nó.
           */
          setConfirmSubmit(false);
          const applied = applyApiFieldErrors(err, setError, { fields: wizardFields });
          if (applied.length > 0) {
            const bad = new Set<string>(applied);
            goToStepWithError((field) => bad.has(field));
          }
        }
      },
      // Gửi mà schema không hợp lệ → nhảy về bước chứa lỗi đầu tiên.
      (formErrors) => {
        setConfirmSubmit(false);
        goToStepWithError((field) => Boolean(formErrors[field]));
        warnMissing();
      },
    )();
  }

  /**
   * "Gửi duyệt" ở bước cuối mở HỘP xác nhận — nhưng chỉ khi mọi cổng đã qua và toàn form hợp lệ;
   * còn thiếu thì nhảy về đúng bước như lượt lưu thật.
   */
  function openConfirm() {
    if (!passesPreSubmitGates()) return;
    void handleSubmit(
      () => setConfirmSubmit(true),
      (formErrors) => {
        goToStepWithError((field) => Boolean(formErrors[field]));
        warnMissing();
      },
    )();
  }

  /**
   * Bước chưa phải bước cuối thì nút chính **đi tiếp**, không gửi API.
   *
   * Vẫn đi qua `onSubmit` của thẻ `<form>` để phím Enter trong ô nhập cũng đi tiếp — nếu gắn
   * `onClick` lên nút thì Enter sẽ gửi form và tạo xe ngay từ bước 1.
   */
  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Chặn gửi trùng: nút `loading` chỉ nuốt sự kiện chuột, không chặn Enter.
    if (submitting) return;

    if (step < lastStep) {
      attemptedSteps.current.add(currentKey);
      // Chỉ validate trường của BƯỚC ĐANG MỞ — validate cả schema sẽ chặn người dùng bằng lỗi
      // của phần họ còn chưa nhìn thấy.
      const valid = await trigger([...steps[step]!.fields]);
      const missing = valid ? publishGaps(currentKey) : [];
      setPublishMissing(missing);
      // Báo đỏ MỌI ô còn thiếu trong một lần bấm - cả ô schema lẫn ô điều kiện lên chợ.
      flagPublishGaps(valid ? missing : publishGaps(currentKey));
      const registrationGap = currentKey === 'basic' && registrationBlocked;
      if (registrationGap) setRegistrationShowErrors(true);
      if (valid && missing.length === 0 && !registrationGap) {
        setStep(step + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    // Phiên hỗ trợ: Enter ở bước cuối chỉ LƯU NHÁP — không có đường gửi duyệt trong wizard.
    if (draftOnly) submitNow({ submitForReview: false });
    else openConfirm();
  }

  /*
   * Mức "Sẵn sàng gửi duyệt" ở cột phải — đọc CÙNG luật với cổng gửi duyệt (điều kiện lên chợ +
   * cà vẹt), chỉ để chủ xe thấy còn thiếu gì; không thay cổng thật.
   */
  const watched = useWatch({ control });
  // Thêm xe không hỏi tên (ADR 0102): xem trước + hộp xác nhận hiện đúng tên server sẽ ghép.
  const autoName = useComposedVehicleName(watched);
  // Ảnh cà vẹt TUỲ CHỌN (ADR 0100) — không tính vào số ảnh bắt buộc.
  const requiredPhotos = requiredVehicleImageTypes(vehicleType ?? VEHICLE_TYPE.CAR).length;
  const readiness: CreateReadiness = useMemo(() => {
    const values = { ...EMPTY_DEFAULTS, ...watched } as VehicleFormValues;
    const gaps = missingPublishRequirementsForForm(values);
    const media = values.media ?? [];
    const slots = requiredVehicleImageTypes(values.vehicleType);
    return {
      photos:
        slots.every((slot) => media.some((item) => item.type === slot)) &&
        (!registrationRequired || !registrationCheck.errors.photo),
      // Ảnh cà vẹt chỉ cần CÓ - máy đọc ra hay không không tính; tên chủ xe / số khung / số máy là ô
      // nhập nên thuộc mục thông tin (18/11/2026).
      info:
        (!registrationRequired ||
          Object.keys(registrationCheck.errors).every((key) => key === 'photo')) &&
        // Tên xe tự ghép từ dòng xe (ADR 0102) - đủ dòng xe là đủ tên.
        Boolean(values.vehicleCatalogModelId && values.branchId) &&
        !gaps.some(
          (gap) => REQUIREMENT_STEP[gap] === 'basic' && gap !== PUBLISH_REQUIREMENT.PHOTOS,
        ),
      pricing:
        (values.serviceTypes ?? []).length > 0 &&
        !gaps.some((gap) => REQUIREMENT_STEP[gap] === 'pricing'),
      ...(shopGaps === null || draftOnly ? {} : { shop: shopGaps.length === 0 }),
      features: (values.features ?? []).length > 0 || Boolean(values.description?.trim()),
    };
  }, [watched, registrationRequired, registrationCheck.errors, shopGaps, draftOnly]);

  /*
   * Nháp chỉ ghi ở các MỐC ĐIỀU HƯỚNG trong luồng (18/11/2026): bấm Tiếp tục / Quay lại (đổi bước) và
   * khi rời màn trong app (unmount - nút lùi, link). F5 / đóng tab thì XOÁ nháp: mở lại là form trống.
   * Ảnh chụp mới nhất giữ ở ref (cập nhật mỗi render), không ghi `sessionStorage` theo từng phím.
   */
  const snapshotRef = useRef<VehicleCreateDraft | null>(null);
  useEffect(() => {
    snapshotRef.current = {
      values: watched as Partial<VehicleFormValues>,
      step,
      autoAcceptEnabled,
      // Đang đọc ảnh mới: `uploadId`/`reading` còn rỗng - ghi đúng thế.
      registration: {
        uploadId: registration.uploadId,
        reading: registration.reading,
        readerAvailable: registration.readerAvailable,
        fields: registration.fields,
        editing: registration.editing,
        // Chỉ lưu ảnh đã đọc XONG (data URL); đang đọc thì chưa có gì để giữ.
        previewUrl: registration.phase === 'ready' ? registration.previewUrl : null,
      },
    };
  });

  useEffect(() => {
    if (!draftKey || !snapshotRef.current) return;
    writeVehicleCreateDraft(draftKey, { ...snapshotRef.current, step });
  }, [draftKey, step]);

  useEffect(() => {
    if (!draftKey) return;
    let unloading = false;
    const onUnload = () => {
      unloading = true;
      clearVehicleCreateDraft(draftKey);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      // Rời màn trong app (không phải F5) ⇒ giữ đúng những gì đã nhập.
      if (!unloading && snapshotRef.current) writeVehicleCreateDraft(draftKey, snapshotRef.current);
    };
  }, [draftKey]);

  function renderStep() {
    const props = { control, isCar, setValue };
    switch (currentKey) {
      case 'basic':
        return (
          <CreateVehicleInfoStep
            {...props}
            branchOptions={branchOptions}
            branchLoading={branches.isLoading}
            branchDisabled={branches.isError}
            branchHidden={branchHidden}
            pickupAddress={
              branchHidden
                ? { branch: selectedBranch, loading: branches.isLoading }
                : null
            }
            sourceHidden={sourceHidden}
            registration={
              registrationRequired
                ? {
                    state: registration,
                    onChange: setRegistration,
                    showErrors: registrationShowErrors,
                  }
                : null
            }
          />
        );
      case 'pricing':
        return (
          <CreateVehiclePricingStep
            control={control}
            isCar={isCar}
            pricePreview={null}
            setValue={setValue}
            shopPolicy={!commission}
            autoAccept={
              draftOnly ? undefined : { value: autoAcceptEnabled, onChange: setAutoAcceptEnabled }
            }
          />
        );
      default:
        return <CreateVehicleFeaturesStep {...props} />;
    }
  }

  /**
   * Hàng nút cuối trang (Figma: "← Quay lại" · "Tiếp tục →" · "Gửi duyệt →").
   *
   * Chữ "Quay lại" giống nút rời trang của `ManagePageHeader`, nên TÊN KHẢ TRUY CẬP của nút lùi
   * bước khác đi (`wizard.backToStep`) để trình đọc màn hình phân biệt được.
   */
  /** Nút đi tiếp của bước - vàng thương hiệu, cỡ lớn; lặp ở cuối nội dung (`endAction`). */
  const forward =
    step < lastStep ? (
      <Button
        type="primary"
        size="large"
        htmlType="submit"
        loading={submitting}
        icon={decorativeIcon(<ArrowRightOutlined />)}
        iconPlacement="end"
      >
        {tCommon('next')}
      </Button>
    ) : draftOnly ? (
      <Button type="primary" size="large" htmlType="submit" loading={submitting}>
        {t('wizard.saveDraft')}
      </Button>
    ) : (
      <Button
        type="primary"
        size="large"
        htmlType="submit"
        loading={submitting}
        icon={decorativeIcon(<ArrowRightOutlined />)}
        iconPlacement="end"
      >
        {t('wizard.submit')}
      </Button>
    );

  const footer = (
    <>
      {step === 0 ? (
        <Button
          size="large"
          className={styles.footerStart}
          onClick={() => (isDirty || draft ? setConfirmCancel(true) : onCancel())}
        >
          {t('wizard.cancel')}
        </Button>
      ) : (
        <Button
          size="large"
          onClick={() => setStep(step - 1)}
          aria-label={t('wizard.backToStep')}
          icon={decorativeIcon(<ArrowLeftOutlined />)}
        >
          {tCommon('back')}
        </Button>
      )}
      {forward}
    </>
  );

  return (
    /*
     * `<Form component={false}>` chỉ cấp NGỮ CẢNH bố cục cho `Form.Item`, không dựng thêm thẻ
     * `<form>` — form thật vẫn là thẻ dưới đây với `onSubmit` của React Hook Form (ADR 0004).
     */
    // Ghi chú dưới các ô của wizard thành dấu ⓘ cạnh nhãn (18/11/2026) - lỗi vẫn in dưới ô.
    <HelpAsTipProvider>
    <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
      <form onSubmit={handleFormSubmit} noValidate>
        <VehicleWizard
          steps={steps}
          current={step}
          onStepChange={setStep}
          navigation="sequential"
          plain
          notice={
            errorMessage || publishMissing.length > 0 || stepErrors > 0 ? (
              <div className={styles.noticeStack}>
                {errorMessage ? <Alert type="error" showIcon title={errorMessage} /> : null}
                {publishMissing.length > 0 ? (
                  <Alert
                    type="error"
                    showIcon
                    title={t('wizard.publishRequired', {
                      items: formGaps(publishMissing, getValues()),
                    })}
                  />
                ) : null}
                {stepErrors > 0 ? (
                  <Alert
                    type="error"
                    showIcon
                    title={t('wizard.stepErrors', { count: stepErrors })}
                  />
                ) : null}
              </div>
            ) : null
          }
          aside={
            <CreateVehicleAside
              preview={{ ...watched, name: autoName }}
              readiness={readiness}
              branchLabel={selectedBranchLabel}
              shop={previewShopOf(shop.data)}
              requiredPhotos={requiredPhotos}
            />
          }
          footer={footer}
        >
          {renderStep()}
        </VehicleWizard>
      </form>

      {draftOnly ? null : (
        <CreateVehicleConfirmDialog
          open={confirmSubmit}
          values={{ ...getValues(), name: autoName }}
          branchLabel={selectedBranchLabel}
          registration={
            registrationRequired
              ? {
                  chassisNumber: registration.fields.chassisNumber,
                  engineNumber: registration.fields.engineNumber,
                }
              : null
          }
          submitting={submitting}
          onClose={() => setConfirmSubmit(false)}
          onSaveDraft={() => submitNow({ submitForReview: false })}
          onSubmit={() => submitNow({ submitForReview: true })}
        />
      )}

      <ResponsiveDialog
        open={confirmCancel}
        title={t('wizard.cancelWizard.title')}
        size="sm"
        onClose={() => setConfirmCancel(false)}
        onOk={onCancel}
        okText={t('wizard.cancelWizard.ok')}
        cancelText={t('wizard.cancelWizard.cancel')}
        destructive
      >
        {t('wizard.cancelWizard.body')}
      </ResponsiveDialog>
    </Form>
    </HelpAsTipProvider>
  );
}
