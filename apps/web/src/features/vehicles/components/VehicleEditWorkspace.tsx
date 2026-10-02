'use client';

import { Alert, App, Badge, Button, Card, Form, Skeleton, Switch, Tabs, Tooltip } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  SERVICE_TYPE,
  SUPPORT_CAPABILITY,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  isVehicleFuelTypeAllowed,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_EDIT_TAB,
  VEHICLE_EDIT_TAB_VALUES,
  type VehicleEditTab,
} from '@/constants/routes';
import {
  SUPPORT_HIDDEN_AREA,
  supportAllowsVehicleTab,
  useSupportCan,
  useSupportHides,
  useSupportPinnedField,
  useSupportSession,
} from '@/features/tenant-support/support-session';
import { getErrorMessage } from '@/services/api-client';
import { VehiclePricingWorkspace } from '@/features/rental-policies/components/VehiclePricingWorkspace';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import { informationValuesToInput, vehicleToFormValues } from '../mappers';
import type { UpdateVehicleInput, VehicleDetail } from '../types';
import {
  BasicSection,
  ConsumptionSection,
  DimensionsSection,
  EngineOutputSection,
  FeaturesDescriptionSection,
  VEHICLE_SECTIONS,
  VehicleEnergySection,
  VehicleIdentitySection,
} from './VehicleFormSections';
import { VehicleDocumentsWorkspace } from '@/features/vehicle-documents/components/VehicleDocumentsWorkspace';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/components/VehicleMaintenanceWorkspace';
import { VehicleSourceWorkspace } from './VehicleSourceWorkspace';
import { VehicleEditHeader } from './VehicleEditHeader';
import { VehicleServiceChips } from '@/features/vehicle-manage/components/VehicleServiceChips';
import { VehicleInfoAside } from './VehicleInfoAside';
import { VehicleManageProvider } from '@/features/vehicle-manage/components/VehicleManageContext';
import { VehicleSectionNav } from '@/features/vehicle-manage/components/VehicleSectionNav';
import { ImagesSection as VehicleImagesSection } from '@/features/vehicle-manage/components/sections/ImagesSection';
import { useServiceToggle } from '@/features/vehicle-manage/hooks/use-service-toggle';
import { BookingTermsSection } from '@/features/vehicle-manage/components/sections/BookingTermsSection';
import { DriverSurchargesSection } from '@/features/vehicle-manage/components/sections/DriverSurchargesSection';
import { HandoverTimeSection } from '@/features/vehicle-manage/components/sections/HandoverTimeSection';
import {
  OPERATIONS_TABS,
  editNavGroups,
  editTabServiceType,
  resolveEditTab,
} from './vehicle-edit-nav';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { branchLabel } from '@/features/branches/branch-label';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import styles from './VehicleEditWorkspace.module.css';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

/**
 * Mục đang mở của không gian sửa xe. Giá trị đi trên `?tab=` nên nó là `VehicleEditTab`, không
 * phải một union viết tay thứ hai — thêm một mục ở `VEHICLE_EDIT_TAB` là nó tự có mặt ở đây.
 */
type WorkspaceTab = VehicleEditTab;

interface VehicleEditWorkspaceProps {
  vehicle: VehicleDetail;
  submitting: boolean;
  errorMessage?: string | null;
  onSave: (body: UpdateVehicleInput) => Promise<VehicleDetail>;
  onCancel: () => void;
}

const INFORMATION_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'name',
  // Chi nhánh giữ xe = vị trí công khai của xe, ô nằm ngay ở tab này nên phải được validate và
  // đếm lỗi cùng các trường khác — không thì lưu với chi nhánh rỗng mà không có báo lỗi nào.
  'branchId',
  'vehicleType',
  // `serviceTypes` KHÔNG còn ở đây (30/09/2026): ô đó rời form, công tắc trên menu trái ghi nó.
  // `operationStatus` cũng vậy: sửa tại chỗ trên thẻ đầu xe.
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
  // Dời sang mục này cùng khối "Tiện ích & mô tả" (30/09/2026) — phải được validate và đếm lỗi
  // cùng mục, nếu không mô tả quá 4000 ký tự sẽ chặn Lưu mà không báo ô nào.
  'features',
  'description',
];

/** Các trường của tab ngang "Thông số kỹ thuật nâng cao" — cần mở tab đó khi chúng lỗi. */
const ADVANCED_SPEC_FIELDS = VEHICLE_SECTIONS.find((section) => section.key === 'specs')!.fields;

/**
 * Hai tab NGANG của mục "Thông tin xe & tiện ích" (30/09/2026) — thay vùng thu gọn "Thông số kỹ
 * thuật nâng cao". Cùng MỘT form, MỘT nút Lưu: đổi tab không mất gì đang gõ dở.
 */
const INFO_PANE = { BASIC: 'basic', ADVANCED: 'advanced' } as const;
type InfoPane = (typeof INFO_PANE)[keyof typeof INFO_PANE];

/**
 * Trường có ô ở tab nâng cao. `fuelConsumptionCombined` thuộc nhóm "specs" của wizard nhưng ô
 * của nó ở khối năng lượng (tab cơ bản) — không tính vào tab nâng cao.
 */
const ADVANCED_ONLY = new Set<string>(
  ADVANCED_SPEC_FIELDS.filter((field) => field !== 'fuelConsumptionCombined'),
);

/**
 * Giá trị `?tab=` hợp lệ đọc từ hằng số CHUNG (Wave 8) — cùng bảng mà Hồ sơ 360 và cảnh báo
 * dùng để sinh link. Trước đây danh sách này gõ tay ở đây, nên thêm tab mới là thêm một chỗ
 * phải nhớ sửa. Giá trị lạ rơi về "Thông tin" như cũ.
 */
function parseTab(value: string | null): WorkspaceTab {
  return (VEHICLE_EDIT_TAB_VALUES as string[]).includes(value ?? '')
    ? (value as WorkspaceTab)
    : VEHICLE_EDIT_TAB.INFORMATION;
}

export function VehicleEditWorkspace({
  vehicle,
  submitting,
  errorMessage,
  onSave,
  onCancel,
}: VehicleEditWorkspaceProps) {
  const t = useTranslations('Vehicles.edit');
  const tMenu = useTranslations('VehicleManage.menu');
  const tManage = useTranslations('VehicleManage');
  const tActions = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const tAdvanced = useTranslations('Vehicles.form.advanced');
  /*
   * Phiên hỗ trợ (ADR 0050 §13): thủ tục cho thuê (pháp lý + cọc) và phụ phí có tài xế là khu
   * TIỀN — không dựng, y như `VehicleOperationsPanel` của develop.
   */
  const moneyHidden = useSupportHides(SUPPORT_HIDDEN_AREA.MONEY_TERMS);
  // Capability RIÊNG cho khối vận hành trong phiên hỗ trợ — xem mục OPERATIONS của `contentOf`. Khu TIỀN (thủ tục, phụ phí) ẩn trong `VehicleOperationsTab`.
  const canOperate = useSupportCan(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
  const domainLabel = useDomainLabel();
  const applyApiFieldErrors = useApiFieldErrors();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { vehicles: vehiclePaths } = useWorkspace();
  /*
   * Phiên hỗ trợ của nhân sự nền tảng (ADR 0050): chỉ các tab của Đợt 1 (thông tin, ảnh, bảo
   * dưỡng). Tab khác không mờ đi — chúng không có mặt. Tab lạ trên URL rơi về "Thông tin".
   */
  const support = useSupportSession();
  const supportPinned = useSupportPinnedField();
  const can = useVehicleCapabilities();
  const permissions = usePermissions();
  const canUpdate = permissions.has(PERMISSION.VEHICLE_UPDATE);
  /*
   * Công tắc dịch vụ trên tiêu đề nhóm — CÙNG hook với khu tài khoản (30/09/2026). Phiên hỗ trợ
   * không có công tắc: bật/tắt dịch vụ là quyết định kinh doanh của chủ xe.
   */
  const toggle = useServiceToggle(vehicle, canUpdate && !support);
  /**
   * Tab này có mặt với NGƯỜI NÀY không — quyền ∧ cờ gói, cùng bảng luật với Hồ sơ 360.
   *
   * Dùng ở cả hai chỗ (giá trị khởi tạo từ `?tab=` và danh sách tab), nên một link cũ tới
   * `?tab=maintenance` của người không còn gói sẽ rơi về "Thông tin" thay vì mở một thân tab rỗng.
   */
  const tabEnabled = (tab: WorkspaceTab): boolean => {
    if (tab === VEHICLE_EDIT_TAB.SOURCE) return can.source;
    if (tab === VEHICLE_EDIT_TAB.DOCUMENTS) return can.documents;
    if (tab === VEHICLE_EDIT_TAB.MAINTENANCE) return can.maintenance;
    return true;
  };
  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    // Bí danh (`operations`, `*-terms`) quy về mục thật; phiên hỗ trợ và năng lực xét trên mục thật.
    let tab = resolveEditTab(parseTab(searchParams.get('tab')));
    /*
     * Giữ hành vi của route cũ `/optimization`: khi xe chỉ có dịch vụ có tài xế, route đó mở
     * thẳng form có tài xế — không để người dùng rơi vào mục tự lái đang tắt.
     */
    const services = vehicle.serviceTypes ?? [];
    if (
      tab === VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION &&
      !services.includes(SERVICE_TYPE.SELF_DRIVE) &&
      services.includes(SERVICE_TYPE.WITH_DRIVER)
    ) {
      tab = VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION;
    }
    return supportAllowsVehicleTab(support, tab) && tabEnabled(tab)
      ? tab
      : VEHICLE_EDIT_TAB.INFORMATION;
  });
  /*
   * Link tới THỦ TỤC (`?tab=self-drive-terms`…) mở mục "Nhận chuyến & thủ tục" rồi cuộn tới card
   * thủ tục — card đó đứng sau card tối ưu, người bấm vào không phải tự tìm.
   */
  const [scrollToTerms] = useState(() => {
    const raw = parseTab(searchParams.get('tab'));
    return raw === VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS || raw === VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS;
  });
  useEffect(() => {
    if (scrollToTerms) {
      document.getElementById(RENTAL_TERMS_ANCHOR)?.scrollIntoView({ block: 'start' });
    }
  }, [scrollToTerms]);
  const [pendingTab, setPendingTab] = useState<WorkspaceTab | null>(null);
  const [infoPane, setInfoPane] = useState<InfoPane>(INFO_PANE.BASIC);
  /**
   * Tab Nguồn xe có form RIÊNG (không chung RHF với info/media) — nó tự báo dirty lên đây
   * để guard đổi tab gộp cả nó. Bỏ thay đổi = remount tab nguồn qua `sourceResetKey`.
   */
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourceResetKey, setSourceResetKey] = useState(0);
  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormSchema,
    'Vehicles.form.validation',
  );
  const {
    control,
    getFieldState,
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    trigger,
    formState: { isDirty, errors },
  } = useForm<VehicleFormValues>({
    resolver,
    defaultValues: initialValues,
  });
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });

  /**
   * Options chi nhánh cho tab Thông tin. Danh sách chỉ có chi nhánh ĐANG HOẠT ĐỘNG (không cho
   * chuyển xe vào chi nhánh đã ngừng), nhưng phải BỔ SUNG chi nhánh hiện tại của xe nếu nó vừa
   * bị ngừng — thiếu bước này thì mở form sửa sẽ thấy ô chi nhánh trống và người dùng tưởng xe
   * mất vị trí.
   */
  const branches = useActiveBranches();
  // Nhãn "chưa có tỉnh/thành" thuộc về màn Chi nhánh — một khoá, một bản dịch.
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
  }, [branches.data, t, noProvince, vehicle.branch]);

  const isApproved = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  /**
   * Xe ĐÃ ĐƯỢC DUYỆT: bốn ô căn cước bị KHOÁ (biển số · hộp số · nhiên liệu · năm sản xuất) —
   * 09/09/2026, ghi đè luật "sửa là duyệt lại" của ADR 0008. Server chặn lại bằng
   * `VEHICLE_FIELD_LOCKED` nên đây chỉ là lớp trải nghiệm.
   */
  const lockedNotice = isApproved ? t('lockedField') : undefined;
  // Form RHF chỉ còn phục vụ MỘT mục — ảnh đã tách sang section tự lưu (30/09/2026).
  const activeFields = INFORMATION_FIELDS;
  const activeErrors = activeFields.filter((field) => errors[field]).length;
  // Số lỗi trên từng tab ngang — tab đang ẩn vẫn báo được là nó có lỗi.
  const advancedErrors = ADVANCED_SPEC_FIELDS.filter(
    (field) => errors[field] && ADVANCED_ONLY.has(field),
  ).length;
  const basicErrors = activeFields.filter(
    (field) => errors[field] && !ADVANCED_ONLY.has(field),
  ).length;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (vehicleType !== VEHICLE_TYPE.CAR) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, setValue, vehicleType]);

  function goToTab(next: WorkspaceTab) {
    if (next !== VEHICLE_EDIT_TAB.INFORMATION) setInfoPane(INFO_PANE.BASIC);
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`${vehiclePaths.edit(vehicle.id)}?${params.toString()}`, { scroll: false });
  }

  function requestTab(next: string) {
    const target = next as WorkspaceTab;
    if (!isDirty && !sourceDirty) {
      goToTab(target);
      return;
    }
    setPendingTab(target);
  }

  /**
   * Mở tab NGANG đang chứa lỗi. Tab cơ bản thắng: lỗi của nó chặn nhiều hơn (tên, biển số, chi
   * nhánh…), nên chỉ đổi sang nâng cao khi MỌI lỗi đều nằm ở đó.
   */
  function revealErrors(fields: readonly string[]) {
    if (fields.length === 0) return;
    const advancedOnly = fields.every((field) => ADVANCED_ONLY.has(field));
    setInfoPane(advancedOnly ? INFO_PANE.ADVANCED : INFO_PANE.BASIC);
  }

  async function saveCurrent() {
    const valid = await trigger([...activeFields]);
    if (!valid) {
      // Lỗi validate không được nằm khuất ở tab đang ẩn — mở đúng tab có lỗi cho thấy.
      revealErrors(activeFields.filter((field) => getFieldState(field).invalid));
      return;
    }
    await submitCurrent(getValues());
  }

  async function submitCurrent(values: VehicleFormValues) {
    /*
     * Chỉ còn MỘT nhánh lưu qua form: mục "Thông tin xe & tiện ích". Ảnh đã tách sang section
     * riêng với mutation của chính nó (30/09/2026) — xem `contentOf[MEDIA]`.
     */
    const body = informationValuesToInput(values);
    try {
      const updated = await onSave(body);
      reset(vehicleToFormValues(updated));
    } catch (err) {
      /*
       * Server bắt được thứ yup bỏ lọt → gắn lỗi vào ĐÚNG ô thay vì để lại mỗi toast chung.
       * Không có lớp này thì một luật chỉ tồn tại ở backend (số chữ số thập phân, độ dài…)
       * hiện ra dưới dạng "Dữ liệu gửi lên không hợp lệ" trên một form vài chục ô và người
       * dùng phải tự dò. Mutation owner vẫn hiện thông báo chung như cũ.
       */
      const applied = applyApiFieldErrors(err, setError, { fields: activeFields });
      // Lỗi không được nằm khuất ở tab đang ẩn — cùng luật với nhánh lỗi yup.
      if (applied.length > 0) revealErrors(applied);
      // Giữ nguyên form để người dùng sửa/thử lại.
    }
  }

  /*
   * Nguồn xe, Giấy tờ, Bảo dưỡng gác theo NĂNG LỰC (`tabEnabled`) — cùng bảng luật với Hồ sơ 360
   * (`useVehicleCapabilities`), nên hai màn của cùng một chiếc xe không nói hai chuyện.
   */
  /** Công tắc dịch vụ có mặt không — ngoài phiên hỗ trợ và có quyền sửa xe. */
  const canToggle = canUpdate && !support;

  /** NỘI DUNG của từng mục. `undefined` = mục "Thông tin xe & tiện ích" (form RHF bên dưới). */
  const contentOf: Partial<Record<WorkspaceTab, ReactNode>> = {
    /*
     * "Giá & chính sách" — MỘT màn, MỘT nút Lưu, đúng như develop: giá của mọi dịch vụ xe đang
     * có + nguồn chính sách + cọc · giao xe · km · quá giờ · ưu đãi.
     */
    [VEHICLE_EDIT_TAB.PRICING]: <VehiclePricingTab vehicle={vehicle} canEdit={canUpdate} />,
    [VEHICLE_EDIT_TAB.SOURCE]: (
      <VehicleSourceWorkspace
        key={sourceResetKey}
        vehicle={vehicle}
        onDirtyChange={setSourceDirty}
      />
    ),
    /*
     * ẢNH dùng NGUYÊN section của khu tài khoản (30/09/2026) — một màn ảnh cho cả hai khu: có
     * thanh tiến trình, thử lại khi upload hỏng, kéo thả sắp xếp, và tự lưu bằng mutation của
     * chính nó. Section đọc `useManagedVehicle()` nên bọc provider; quyền sửa là `canUpdate`
     * — ảnh chưa bao giờ đòi capability vận hành của phiên hỗ trợ.
     *
     * Wizard THÊM XE vẫn giữ `TypedMediaFields`: lúc đó chưa có `vehicleId` nào để `PATCH`.
     */
    [VEHICLE_EDIT_TAB.MEDIA]: (
      <VehicleManageProvider value={{ vehicle, canEdit: canUpdate }}>
        <VehicleImagesSection />
      </VehicleManageProvider>
    ),
    [VEHICLE_EDIT_TAB.DOCUMENTS]: <VehicleDocumentsWorkspace vehicle={vehicle} />,
    [VEHICLE_EDIT_TAB.MAINTENANCE]: <VehicleMaintenanceWorkspace vehicle={vehicle} />,
    /*
     * `canUpdate && canOperate` — đúng phép nhân của `VehicleOperationsPanel` develop: trong
     * phiên hỗ trợ khối vận hành còn đòi capability riêng `VEHICLE_OPERATIONS_UPDATE`.
     */
    // Năm khối của tab "Vận hành & điều kiện thuê" develop — CÙNG section, mỗi card tự lưu.
    [VEHICLE_EDIT_TAB.HANDOVER_TIME]: <HandoverTimeSection />,
    // "Nhận chuyến & thủ tục" — CÙNG section với khu tài khoản (tối ưu + thủ tục, thủ tục ẩn trong phiên).
    [VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION]: (
      <BookingTermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />
    ),
    [VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION]: (
      <BookingTermsSection serviceType={SERVICE_TYPE.WITH_DRIVER} />
    ),
    [VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES]: <DriverSurchargesSection />,
  };

  const services = vehicle.serviceTypes ?? [];
  /*
   * Công tắc dịch vụ trên tiêu đề nhóm — CÙNG hook `useServiceToggle` với khu tài khoản: gửi
   * `serviceTypes` đầy đủ, không bao giờ rỗng, hỏi lại khi tắt một dịch vụ đang có giá riêng.
   * Công tắc bị chặn nói lý do qua tooltip. Phiên hỗ trợ không có công tắc.
   */
  const groups = editNavGroups({
    t: tMenu,
    enabled: (tab) => tabEnabled(tab) && supportAllowsVehicleTab(support, tab),
    services,
    moneyHidden,
  }).map(({ serviceType, ...group }) => {
    if (!serviceType || !canToggle) return group;
    const on = services.includes(serviceType);
    const label = domainLabel('serviceType', serviceType);
    const blocked = toggle.blockedReason(serviceType, !on);
    return {
      ...group,
      control: (
        <Tooltip title={blocked ?? undefined}>
          <Switch
            size="small"
            aria-label={tManage('nav.toggleLabel', { service: label })}
            checked={on}
            disabled={Boolean(blocked) || toggle.pending}
            loading={toggle.pending}
            onChange={(next) => toggle.toggle(serviceType, next)}
          />
        </Tooltip>
      ),
      /*
       * Dài hạn không có thiết lập vận hành riêng — nhóm chỉ có công tắc, kèm lời nhắc giá tháng ở
       * đâu (bấm được, đi qua `requestTab` như mọi mục khác).
       */
      extra:
        serviceType === SERVICE_TYPE.LONG_TERM ? (
          <button
            type="button"
            className={styles.groupNote}
            onClick={() => requestTab(VEHICLE_EDIT_TAB.PRICING)}
          >
            {tMenu('longTermNote')}
          </button>
        ) : undefined,
    };
  });

  const content = contentOf[activeTab];
  /** Mở mục Hình ảnh từ thẻ đầu xe / cột phải — chỉ khi người này tới được mục đó. */
  const openImages =
    tabEnabled(VEHICLE_EDIT_TAB.MEDIA) && supportAllowsVehicleTab(support, VEHICLE_EDIT_TAB.MEDIA)
      ? () => requestTab(VEHICLE_EDIT_TAB.MEDIA)
      : undefined;
  /*
   * Dịch vụ của mục đang mở đã TẮT: nói ra và mời bật (qua CÙNG công tắc) thay vì hiện một form
   * ghi vào dịch vụ không hoạt động — cùng cách với khu tài khoản.
   */
  const activeService = editTabServiceType(activeTab);
  const serviceOff = activeService !== null && !services.includes(activeService);
  const offLabel = activeService ? domainLabel('serviceType', activeService) : '';
  const canEnableService =
    activeService !== null && canToggle && !toggle.blockedReason(activeService, true);

  return (
    <div className={styles.workspace}>
      {/*
        Trạng thái vận hành sửa TẠI CHỖ trên thẻ (lưu ngay) — cần `vehicles.update`, và phiên hỗ
        trợ thiếu capability riêng của ô này thì chỉ thấy thẻ trạng thái (ADR 0050 §13).
      */}
      <VehicleEditHeader
        vehicle={vehicle}
        onEditImages={openImages}
        statusEditable={canUpdate && !supportPinned('operationStatus')}
      />

      <div className={styles.body}>
        {/*
          Menu trái thay thanh tab ngang (29/09/2026) — CÙNG component với khu tài khoản.

          Mục là NÚT chứ không phải `Link`: đổi mục phải đi qua `requestTab`, thứ chặn lại và hỏi
          "bỏ thay đổi chưa lưu?" khi form đang dở. Một `<Link>` sẽ rời trang trước khi ai kịp hỏi.
        */}
        <aside className={styles.nav}>
          <VehicleSectionNav
            groups={groups}
            activeKey={activeTab}
            ariaLabel={t('nav.menuLabel')}
            onSelect={requestTab}
          />
        </aside>

        <div className={styles.main}>
          <>
            {serviceOff && activeService ? (
              <EmptyState
                variant="empty"
                title={tManage('disabledSection.title', { service: offLabel })}
                description={
                  canToggle
                    ? tManage('disabledSection.body', { service: offLabel })
                    : tManage('operationsTab.serviceOff')
                }
                action={
                  canEnableService ? (
                    <Button
                      type="primary"
                      loading={toggle.pending}
                      onClick={() => toggle.toggle(activeService, true)}
                    >
                      {tManage('disabledSection.enable', { service: offLabel })}
                    </Button>
                  ) : undefined
                }
              />
            ) : content && OPERATIONS_TABS.includes(activeTab) ? (
              /*
               * `canUpdate && canOperate` — đúng phép nhân của `VehicleOperationsPanel` develop:
               * trong phiên hỗ trợ khối vận hành còn đòi capability `VEHICLE_OPERATIONS_UPDATE`.
               */
              <VehicleManageProvider value={{ vehicle, canEdit: canUpdate && canOperate }}>
                {content}
              </VehicleManageProvider>
            ) : (
              (content ?? null)
            )}

            {activeTab === VEHICLE_EDIT_TAB.INFORMATION ? (
              /*
               * Hai cột (30/09/2026): form bên trái, cột xem nhanh bên phải (ảnh + tóm tắt +
               * thông báo khoá trường). Cột phải CHỈ ĐỌC — không có lối ghi thứ hai.
               *
               * Không có `vehicles.update` thì form CHỈ XEM. Chỉ tới được đây trong phiên hỗ trợ chế độ xem
               * (ADR 0050) — người của gian hàng thiếu quyền sửa bị trang chặn từ trước.
               */
              <div className={styles.infoLayout}>
                <Form component={false} layout="vertical" colon={false} disabled={!canUpdate}>
                  <form
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSubmit(
                        () => saveCurrent(),
                        (invalid) => revealErrors(Object.keys(invalid)),
                      )();
                    }}
                  >
                    {errorMessage ? <Alert type="error" showIcon title={errorMessage} /> : null}
                    {activeErrors > 0 ? (
                      <Alert
                        className={styles.formAlert}
                        type="error"
                        showIcon
                        title={t('errors', { count: activeErrors })}
                      />
                    ) : null}
                    <Tabs
                      className={styles.infoTabs}
                      activeKey={infoPane}
                      onChange={(key) => setInfoPane(key as InfoPane)}
                      items={[
                        {
                          key: INFO_PANE.BASIC,
                          label: (
                            <Badge count={basicErrors} size="small" offset={[8, -2]}>
                              {t('infoTabs.basic')}
                            </Badge>
                          ),
                          children: (
                            <div className={styles.sectionStack}>
                              {/*
                              Tên · mã · chi nhánh · loại xe: bốn thứ định danh chiếc xe trong
                              đội. Trạng thái vận hành nay sửa tại chỗ trên thẻ đầu xe.
                            */}
                              <Card title={t('cards.general')} className={styles.formCard}>
                                <BasicSection
                                  control={control}
                                  isCar={vehicleType === VEHICLE_TYPE.CAR}
                                  codeReadOnly
                                  branchOptions={branchOptions}
                                  branchLoading={branches.isLoading}
                                  branchDisabled={!canUpdate}
                                  hideServiceTypes
                                />
                                {/* Loại dịch vụ: nhãn bấm là lưu ngay — cùng đường ghi với công tắc trên menu. */}
                                <VehicleServiceChips
                                  vehicle={vehicle}
                                  canEdit={canUpdate && !support}
                                />
                              </Card>
                              <Card title={t('cards.identity')} className={styles.formCard}>
                                <VehicleIdentitySection
                                  control={control}
                                  isCar={vehicleType === VEHICLE_TYPE.CAR}
                                  lockedNotice={lockedNotice}
                                />
                              </Card>
                              <Card title={t('cards.energy')} className={styles.formCard}>
                                <VehicleEnergySection
                                  control={control}
                                  isCar={vehicleType === VEHICLE_TYPE.CAR}
                                  lockedNotice={lockedNotice}
                                />
                              </Card>
                              {/*
                              Tiện ích & mô tả là thuộc tính MÔ TẢ của chiếc xe, cùng một lần lưu
                              với tên/biển số/thông số — khu tài khoản cũng đặt chúng ở đây.
                            */}
                              <Card
                                title={t('cards.featuresDescription')}
                                className={styles.formCard}
                              >
                                <FeaturesDescriptionSection
                                  control={control}
                                  isCar={vehicleType === VEHICLE_TYPE.CAR}
                                />
                              </Card>
                            </div>
                          ),
                        },
                        {
                          key: INFO_PANE.ADVANCED,
                          label: (
                            <Badge count={advancedErrors} size="small" offset={[8, -2]}>
                              {t('infoTabs.advanced')}
                            </Badge>
                          ),
                          children: (
                            <div className={styles.sectionStack}>
                              <p className={styles.paneHint}>{t('advanced.hint')}</p>
                              <Card
                                title={tAdvanced('dimensionsTitle')}
                                className={styles.formCard}
                              >
                                <DimensionsSection control={control} />
                              </Card>
                              <Card title={tAdvanced('engineTitle')} className={styles.formCard}>
                                <EngineOutputSection control={control} />
                              </Card>
                              <Card
                                title={tAdvanced('consumptionTitle')}
                                className={styles.formCard}
                              >
                                <ConsumptionSection control={control} />
                              </Card>
                            </div>
                          ),
                        },
                      ]}
                    />

                    {canUpdate ? (
                      <StickyFormActions
                        submitLabel={tActions('saveChanges')}
                        cancelLabel={isDirty ? t('revert') : tActions('cancel')}
                        onCancel={isDirty ? () => reset(initialValues) : onCancel}
                        submitting={submitting}
                        disabled={!isDirty}
                        onSubmitClick={() => {
                          void handleSubmit(
                            () => saveCurrent(),
                            (invalid) => revealErrors(Object.keys(invalid)),
                          )();
                        }}
                      />
                    ) : null}
                  </form>
                </Form>
                <VehicleInfoAside vehicle={vehicle} onEditImages={openImages} />
              </div>
            ) : null}
          </>
        </div>
      </div>

      <ResponsiveDialog
        open={pendingTab !== null}
        title={t('discard.title')}
        size="sm"
        onClose={() => setPendingTab(null)}
        onOk={() => {
          reset(initialValues);
          // Bỏ thay đổi của tab Nguồn xe: remount để form con dựng lại từ dữ liệu đã lưu.
          if (sourceDirty) {
            setSourceDirty(false);
            setSourceResetKey((key) => key + 1);
          }
          const next = pendingTab;
          setPendingTab(null);
          if (next) goToTab(next);
        }}
        okText={t('discard.ok')}
        cancelText={t('discard.cancel')}
        destructive
      >
        {t('discard.body')}
      </ResponsiveDialog>
      {toggle.dialog}
    </div>
  );
}

function VehiclePricingTab({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.edit.pricingTab');
  const tActions = useTranslations('Common.actions');
  const { message } = App.useApp();
  const pricing = useVehiclePricing(vehicle.id);
  const save = useSaveVehiclePricing(vehicle.id);

  if (pricing.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  if (pricing.isError || !pricing.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('loadError')}
        description={
          <Button size="small" onClick={() => void pricing.refetch()}>
            {tActions('retry')}
          </Button>
        }
      />
    );
  }

  return (
    <VehiclePricingWorkspace
      vehicleName={vehicle.name}
      vehiclePlate={vehicle.plateNumber ?? null}
      pricing={pricing.data}
      canEdit={canEdit}
      submitting={save.isPending}
      onSave={(body) =>
        save.mutate(body, {
          onSuccess: () => message.success(t('saved')),
          onError: (error) => message.error(getErrorMessage(error)),
        })
      }
    />
  );
}
