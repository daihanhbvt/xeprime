import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SubFormSave } from '@/hooks/use-report-dirty';
import { Pressable, type ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useController, useForm, useWatch, type Control, type Path } from 'react-hook-form';
import { CatalogRentHintFor } from '@/features/vehicles/components/CatalogSuggestions';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LONG_TERM_PACKAGE_MONTHS,
  PERMISSION,
  POLICY_SOURCE,
  isVehicleServiceTypeAllowed,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  SERVICE_TYPE_VALUES,
  type ServiceType,
  STATUS_COLOR,
  POLICY_SECTION,
  POLICY_SECTION_VALUES,
  type PolicySection,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { LineIcon } from '@/components/icons/LineIcon';
import { FieldLabel, FieldShell } from '@/components/ui/Field';
import { RowDivider, SwitchRow } from '@/components/ui/SwitchRow';
import { VehicleEditHeader } from '@/features/vehicles/components/VehicleEditHeader';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { BlockLink } from '@/components/ui/BlockTitle';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MoneyField } from '@/components/ui/MoneyField';
import { WithDriverWageNote } from '@/features/drivers/components/WithDriverWageNote';
import { AutoAcceptBody } from '@/features/vehicle-manage/VehicleAutoAcceptScreen';
import { HandoverBody } from '@/features/vehicle-manage/VehicleHandoverTimeScreen';
import { LongTermPriceHint } from '@/features/rental-policies/components/LongTermPriceHint';
import type { PolicyFormValues } from '@/features/rental-policies/schema';
import { NumberField } from '@/components/ui/NumberField';
import { InlineAction } from '@/components/ui/InlineAction';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFormRefresh, RESET_DISCARD } from '@/hooks/use-form-refresh';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { VehicleServiceToggles } from '@/features/vehicles/components/VehicleServiceToggles';
import type { VehicleDetail } from '@/features/vehicles/api';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import {
  CollateralPolicySection,
  DeliveryPolicySection,
  POLICY_BLOCK,
  PolicySections,
  ToggleRow,
  type PolicyBlock,
} from '@/features/rental-policies/components/PolicySections';
import type { PolicyInheritControl } from '@/features/rental-policies/components/VehiclePolicySectionCard';
import {
  POLICY_SECTION_FORM_FIELDS,
  formToSaveInput,
  policyToForm,
} from '@/features/rental-policies/form';
import { VehiclePolicySectionCard } from '@/features/rental-policies/components/VehiclePolicySectionCard';
import {
  policyCollateral,
  useDescribeCollateral,
} from '@/features/rental-policies/collateral-text';
import { InsuranceModeBlock } from '@/features/rental-policies/components/InsuranceModeBlock';
import { useVehicleInsuranceStatus } from '@/features/vehicle-documents/hooks/use-documents';
import {
  vehiclePricingFormSchema,
  type VehiclePricingFormValues,
} from '@/features/rental-policies/schema';
import { useSaveVehiclePricing, useVehiclePricing } from './hooks/use-vehicle-pricing';
import type { SaveVehiclePricingInput, VehiclePricing } from './api';

const toNumber = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/** Ô GIÁ của form — mọi ô còn lại thuộc khối chính sách (web `PRICE_FIELDS`). */
const PRICE_FIELDS = new Set<string>([
  'weekdayPrice',
  'weekendPrice',
  'hourlyPrice',
  'discountPercent',
  'monthlyPrice',
  'withDriverDailyPrice',
  'withDriverInterCityPrice',
  'withDriverOneWayPrice',
]);

/**
 * Khối chính sách của chủ xe tuyến hoa hồng (cọc · giao xe tận nơi · giới hạn km · quá giờ). Quá giờ
 * mở cho CẢ HAI tuyến từ ADR 0085 điều 3: quyết toán đọc nó từ chính sách hiệu lực của xe, nên
 * server đọc gì thì màn hình phải cho thấy và sửa được (web `PolicyPane`). Ưu đãi dài hạn ẩn nhưng
 * vẫn gửi nguyên.
 */
export const OWNER_POLICY_BLOCKS: readonly PolicyBlock[] = [
  POLICY_BLOCK.COLLATERAL,
  POLICY_BLOCK.DELIVERY,
  POLICY_BLOCK.MILEAGE,
  POLICY_BLOCK.OVERTIME,
];

/**
 * Luật "có ghi bộ chính sách riêng không" — CHÉP NGUYÊN `sendPolicy` của web
 * `VehiclePricingWorkspace`. Tách thành hàm thuần để test khoá được.
 */
/** Các ô của mục "Chính sách thuê" - web `PolicyPane.POLICY_FIELDS`. */
const POLICY_FIELDS: ReadonlySet<string> = new Set([
  'collateralMode',
  'collateralCashEnabled',
  'collateralAssetEnabled',
  'collateralCombination',
  'depositAmount',
  'collateralAssetTypes',
  'deliveryEnabled',
  'deliveryMaxRadiusKm',
  'deliveryTiers',
  'insuranceMode',
]);

export function shouldSendPolicy({
  overriding,
  showPolicy,
  direct,
  policyDirty,
  editMode,
}: {
  overriding: boolean;
  showPolicy: boolean;
  direct: boolean;
  policyDirty: boolean;
  editMode: boolean;
}): boolean {
  // ADR 0112 (web `buildBody`): `switch` đủ năm mục kế thừa ⇒ `shop` (server xoá dòng riêng).
  return showPolicy ? (direct ? overriding || policyDirty : editMode) : overriding;
}

/** Hộp xác nhận đang chờ — cùng một hộp thoại cho lưu và đặt lại. */
type Pending =
  | { kind: 'owner'; body: SaveVehiclePricingInput }
  | { kind: 'override'; body: SaveVehiclePricingInput }
  | { kind: 'inherit'; body: SaveVehiclePricingInput }
  | { kind: 'reset' }
  /** Bật lại kế thừa cho MỘT mục đang riêng (đã lưu) - tuỳ chỉnh của mục đó thôi áp dụng. */
  | { kind: 'sectionReset'; section: PolicySection; label: string }
  | null;

/**
 * Giá & chính sách theo XE — bản native của `VehiclePricingWorkspace` bên web, dùng ở HAI khu:
 *
 * - **Cổng quản lý** (mặc định — web `VehicleEditWorkspace` › `VehiclePricingTab`): đủ năm khối
 *   chính sách, công tắc "Dùng chính sách chung của gian hàng" (`policySource="switch"`), thẻ tóm
 *   tắt chính sách đang kế thừa, nút đặt lại, link sang trang chính sách gian hàng.
 * - **Khu tài khoản** (web `VehiclePricingSection`): `policySource="direct"` — không công tắc,
 *   không thẻ kế thừa; các khối chính sách sửa trực tiếp và CHỈ khi một ô chính sách đổi mới ghi
 *   bộ chính sách riêng. `policyBlocks` = cọc · giao xe · km; `shopPolicyHref={null}`.
 *
 * Khối GIÁ luôn hiện — giá là thuộc tính của xe, không phụ thuộc nguồn chính sách. Giá của xe
 * đang công khai đổi là áp dụng ngay (09/09/2026) — không còn hộp "chờ duyệt lại".
 */
export interface VehiclePricingScreenProps {
  vehicleId: string;
  /** Chỉ hiện nhóm giá của các dịch vụ này. Bỏ trống = mọi dịch vụ xe đăng (web `visibleServices`). */
  visibleServices?: readonly string[];
  /** `hidden` = chỉ giá, nguồn chính sách giữ nguyên (web `policyMode`). */
  policyMode?: 'full' | 'hidden';
  /** Khối chính sách nào hiện — mặc định đủ năm (web `policyBlocks`). */
  policyBlocks?: readonly PolicyBlock[];
  /** Trang chính sách gian hàng; `null` = người dùng không có trang đó (web `shopPolicyHref`). */
  shopPolicyHref?: Href | null;
  /** `switch` (cổng quản lý) · `direct` (khu tài khoản) — xem docblock web. */
  policySource?: 'switch' | 'direct';
  /**
   * Mở từ khu tài khoản (chủ xe tuyến hoa hồng — web `isManage === false`): lui về menu sửa xe
   * Owner Lite, lịch giá ở khu tài khoản. Kèm `pane` = một mục của màn sửa xe Owner Lite (cảnh báo
   * giá tạm tính trong thẻ có tài xế, không thẻ ưu đãi dài hạn, điều khoản không banner kế thừa).
   * Không kèm `pane` = màn "Giá & chính sách" gộp cũ (`VehicleManage.pricing`).
   */
  customerScope?: boolean;
  /**
   * Mục nào của menu sửa xe (web `EDIT_MENU`) — cổng quản lý và khu tài khoản. `services` = "Dịch vụ & giá"
   * (`ServicesPane`: tab dịch vụ · công tắc · nhận chuyến tự động · giá); `policy` = "Chính sách
   * thuê" (`PolicyPane`: nguồn chính sách · các khối chính sách · thời gian chết · điều kiện thuê).
   * Bỏ trống = gộp cả hai (khu tài khoản giữ màn "Giá & chính sách").
   */
  pane?: 'services' | 'policy';
  /** Tab dịch vụ mở sẵn ở `pane="services"` (bí danh `*-optimization` cũ). */
  initialService?: ServiceType;
  /** `pane="policy"`: cuộn tới khối điều khoản của dịch vụ này (link cũ `*-terms`, web `scrollTo`). */
  scrollToTerms?: ServiceType;
}

export function VehiclePricingScreen({
  vehicleId,
  customerScope = false,
  ...config
}: VehiclePricingScreenProps) {
  const t = useTranslations('Vehicles.pricing');
  const tMenu = useTranslations('VehicleManage.menu');
  const tEditorMenu = useTranslations('Vehicles.editor.menu.items');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const title = config.pane
    ? tEditorMenu(config.pane)
    : customerScope
      ? tMenu('items.pricing')
      : t('title');

  const back = () =>
    goBackOr(
      router,
      customerScope
        ? ROUTES.account.vehicleManage(vehicleId)
        : // App Partner: mục của màn sửa xe — Lui về hub sửa xe (web: menu trái của cùng trang).
          ROUTES.manage.vehicleEdit(vehicleId),
    );
  const vehicle = useVehicle(vehicleId, canView);
  const pricing = useVehiclePricing(vehicleId, canView);

  if (!permissionsLoading && !canView) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={title} description={t('noPermission')} />
        </Screen>
      </>
    );
  }

  if (vehicle.isPending || pricing.isPending) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (vehicle.isError || pricing.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen scrollReveal={false} motion={false} edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={pricing.error ?? vehicle.error}
            title={t('loadError')}
            onRetry={() => {
              void vehicle.refetch();
              void pricing.refetch();
            }}
          />
        </Screen>
      </>
    );
  }

  return (
    <VehiclePricingForm
      vehicleId={vehicleId}
      title={title}
      vehicleName={vehicle.data.name}
      vehiclePlate={vehicle.data.plateNumber ?? null}
      vehicleServices={vehicle.data.serviceTypes ?? []}
      vehicle={vehicle.data}
      pricing={pricing.data}
      canEdit={has(PERMISSION.VEHICLE_UPDATE)}
      onBack={back}
      refreshing={vehicle.isRefetching || pricing.isRefetching}
      onRefetch={() => {
        void vehicle.refetch();
        void pricing.refetch();
      }}
      customerScope={customerScope}
      {...config}
    />
  );
}

function VehiclePricingForm({
  vehicleId,
  title,
  vehicleName,
  vehiclePlate,
  vehicleServices,
  pricing,
  canEdit,
  onBack,
  refreshing,
  onRefetch,
  visibleServices,
  policyMode = 'full',
  policyBlocks,
  shopPolicyHref = ROUTES.manage.shopPolicies(),
  policySource = 'switch',
  customerScope,
  vehicle,
  pane,
  initialService,
}: Omit<VehiclePricingScreenProps, 'customerScope'> & {
  /** Hồ sơ xe — công tắc dịch vụ ở đầu mục (cổng quản lý, web `ServicesPane`). */
  vehicle: VehicleDetail;
  title: string;
  vehicleName: string;
  vehiclePlate: string | null;
  vehicleServices: readonly string[];
  pricing: VehiclePricing;
  canEdit: boolean;
  onBack: () => void;
  refreshing: boolean;
  onRefetch: () => void;
  customerScope: boolean;
}) {
  const colors = useColors();
  const tSection = useTranslations('VehicleManage.pricing');
  const t = useTranslations('Vehicles.pricing');
  const tSaved = useTranslations('Vehicles.edit.pricingTab');
  /* Tiêu đề thẻ giá của mục "Dịch vụ & giá" — CÙNG câu với web `ServicesPane`. */
  const tServices = useTranslations('Vehicles.editor.services');
  const tActions = useTranslations('Common.actions');
  /* Câu "bỏ thay đổi chưa lưu" là của TAB SỬA XE nói chung (`Vehicles.edit.discard`). */
  const tEdit = useTranslations('Vehicles.edit');
  /* Cuộn tới khối điều khoản của link cũ `*-terms` (web `scrollTo`). */
  const scrollRef = useRef<ScrollView | null>(null);
  const toast = useAppToast();
  const tPolicyEditor = useTranslations('Vehicles.editor.policy');
  /* Tiêu đề thẻ từng mục chính sách - CÙNG chữ với trang Chính sách thuê (web ADR 0112). */
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const save = useSaveVehiclePricing(vehicleId);
  /*
   * Bảo hiểm vật chất xe Bắt buộc/Tuỳ chọn (ADR 0091 điều 1, web `PolicyPane`) - chỉ ô tô, chỉ khi
   * nền tảng đang bán theo bậc. Theo chính sách gian hàng thì khoá như mọi ô khác của bộ chính sách.
   */
  const isCarVehicle = vehicle.vehicleType === VEHICLE_TYPE.CAR;
  const insuranceStatus = useVehicleInsuranceStatus(vehicleId, isCarVehicle);
  const insuranceApplies = isCarVehicle && insuranceStatus.data?.applies === true;

  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  /*
   * Kế thừa gian hàng THEO MỤC (ADR 0112 điều 1, web `useVehiclePricingForm`). `savedInherited` là bản
   * server đang lưu; `inherited` là bản người dùng đang bật/tắt - chỉ commit khi bấm Lưu. Không có
   * dòng riêng ⇒ cả năm mục kế thừa.
   */
  const savedKey = (pricing.inheritedSections ?? POLICY_SECTION_VALUES).join(',');
  const savedInherited = useMemo<readonly PolicySection[]>(
    () => (savedKey ? (savedKey.split(',') as PolicySection[]) : []),
    [savedKey],
  );
  const [inherited, setInherited] = useState<readonly PolicySection[]>(savedInherited);
  // Lưu xong (hoặc dữ liệu đổi từ nơi khác) ⇒ về đúng bản server.
  useEffect(() => {
    setInherited(savedInherited);
  }, [savedInherited]);
  const inheritedRef = useRef(inherited);
  useEffect(() => {
    inheritedRef.current = inherited;
  }, [inherited]);
  const [pending, setPending] = useState<Pending>(null);
  /** Còn ít nhất một mục riêng của xe ⇒ lưu là ghi dòng chính sách theo xe. */
  const editMode = inherited.length < POLICY_SECTION_VALUES.length;
  const inheritedChanged =
    [...inherited].sort().join(',') !== [...savedInherited].sort().join(',');
  /*
   * Hai mục của màn sửa xe (web `ServicesPane` · `PolicyPane`) — CẢ HAI tuyến từ 03/11/2026. Khu tài
   * khoản (`customerScope`, Owner Lite) khác gian hàng ở đúng các nhánh `!isManage` của web.
   */
  const servicesPane = pane === 'services';
  const policyPane = pane === 'policy';
  /** Màn "Giá & chính sách" gộp cũ của khu tài khoản — chỉ khi không chọn mục nào. */
  const legacyMerged = customerScope && !pane;
  /*
   * Bộ chính sách tham gia form ở CẢ HAI mục từ ADR 0112: "Dịch vụ xe" mang hạn mức km + quá giờ và
   * ưu đãi dài hạn, "Bảo hiểm & Giao nhận" mang bảo hiểm, cọc, giao nhận. `renderPolicy` chỉ là chỗ
   * VẼ khối chính sách gộp cũ (ngoài hai mục).
   */
  const showPolicy = policyMode === 'full';
  const renderPolicy = showPolicy && !servicesPane;
  const direct = policySource === 'direct';
  /*
   * Chế độ `direct`: khối chính sách có ô bị đổi hay chưa — đọc lúc VALIDATE (getter của
   * `context`) và lúc lưu. Ref vì RHF đọc context ngoài render; đồng bộ trong effect (như web).
   */
  const policyDirtyRef = useRef(false);

  // Nhóm giá hiện theo NĂNG LỰC dịch vụ của xe — không trộn mọi ô giá thành một danh sách.
  const services = pricing.serviceTypes ?? [];
  /*
   * Cổng quản lý: MỘT tab dịch vụ mỗi lần như web `ServicesPane` (ledger §3.6 E8) - mở sẵn dịch vụ
   * đầu tiên đang bật. Bề mặt khách giữ nguyên mọi nhóm giá.
   */
  const allowedServices = SERVICE_TYPE_VALUES.filter((service) =>
    isVehicleServiceTypeAllowed(vehicle.vehicleType, service),
  );
  const [serviceTab, setServiceTab] = useState<ServiceType>(
    () =>
      (initialService && allowedServices.includes(initialService) ? initialService : undefined) ??
      ((allowedServices.find((service) => (services as readonly string[]).includes(service)) ??
        allowedServices[0] ??
        SERVICE_TYPE.SELF_DRIVE) as ServiceType),
  );
  const isVisible = (service: ServiceType) =>
    (services as readonly string[]).includes(service) &&
    (!visibleServices || visibleServices.includes(service)) &&
    !policyPane &&
    (legacyMerged || service === serviceTab);
  const hasSelfDrive = (services as readonly string[]).includes(SERVICE_TYPE.SELF_DRIVE);
  const hasLongTerm = (services as readonly string[]).includes(SERVICE_TYPE.LONG_TERM);
  const hasWithDriver = (services as readonly string[]).includes(SERVICE_TYPE.WITH_DRIVER);
  const showSelfDrive = isVisible(SERVICE_TYPE.SELF_DRIVE);
  const showLongTerm = isVisible(SERVICE_TYPE.LONG_TERM);
  const showWithDriver = isVisible(SERVICE_TYPE.WITH_DRIVER);

  const label = vehiclePlate ? `${vehicleName} (${vehiclePlate})` : vehicleName;

  const resolver = useValidationResolver<VehiclePricingFormValues>(
    vehiclePricingFormSchema,
    'Vehicles.pricing.validation',
  );
  const { control, handleSubmit, reset, resetField, setValue, formState } =
    useForm<VehiclePricingFormValues>({
    resolver,
    /*
     * `policyEditable` tắt ràng buộc khối CHÍNH SÁCH khi các ô đó không được sửa — đúng getter
     * của web: `showPolicy && (editMode || (direct && policyDirty))`. Ở chế độ `direct` không có
     * công tắc mở khoá, nên ràng buộc bật khi chủ xe THẬT SỰ sửa một ô chính sách.
     */
    context: {
      serviceTypes: services,
      get policyEditable() {
        return showPolicy && (direct ? policyDirtyRef.current : true);
      },
      // Mục đang theo gian hàng không có ô nào để sửa ⇒ không được chặn nút Lưu (web).
      get inheritedSections() {
        return direct ? [] : inheritedRef.current;
      },
    },
    /* Giữ ô đang gõ khi dữ liệu server đổi — cùng luật với hai màn form còn lại. */
    resetOptions: { keepDirtyValues: true },
    /*
     * Ô của form = bộ RIÊNG của xe (giữ cả cột của mục đang kế thừa - tắt kế thừa là thấy lại cấu hình
     * cũ); chưa có dòng riêng thì bắt đầu từ chính sách gian hàng. Mục kế thừa vẽ từ `shopForm`.
     */
    values: {
      ...policyToForm(pricing.ownPolicy ?? pricing.policy ?? pricing.shopPolicy),
      weekdayPrice: toNumber(pricing.weekdayPrice),
      weekendPrice: toNumber(pricing.weekendPrice),
      hourlyPrice: toNumber(pricing.hourlyPrice),
      discountPercent: pricing.discountPercent ?? null,
      monthlyPrice: toNumber(pricing.monthlyPrice),
      withDriverDailyPrice: toNumber(pricing.withDriverDailyPrice),
      withDriverInterCityPrice: toNumber(pricing.withDriverInterCityPrice),
      withDriverOneWayPrice: toNumber(pricing.withDriverOneWayPrice),
    },
  });

  /** Bản CHỈ ĐỌC của chính sách gian hàng - các mục đang kế thừa vẽ từ đây (ô khoá). */
  const shopForm = useForm<VehiclePricingFormValues>({
    values: {
      ...policyToForm(pricing.shopPolicy),
      weekdayPrice: null,
      weekendPrice: null,
      hourlyPrice: null,
      discountPercent: null,
      monthlyPrice: null,
      withDriverDailyPrice: null,
      withDriverInterCityPrice: null,
      withDriverOneWayPrice: null,
    },
  });
  const isInherited = (section: PolicySection) => !direct && inherited.includes(section);
  /** Form nối với MỘT mục: của xe, hoặc bản chỉ đọc của gian hàng khi mục kế thừa. */
  const sectionControl = (section: PolicySection) =>
    (isInherited(section) ? shopForm.control : control) as unknown as Parameters<
      typeof PolicySections
    >[0]['control'];

  /** Đưa các ô của MỘT mục về giá trị đã lưu, hoặc về số của gian hàng (web `fillSection`). */
  function fillSection(section: PolicySection, from: 'saved' | 'shop') {
    for (const field of POLICY_SECTION_FORM_FIELDS[section]) {
      const name = field as Path<VehiclePricingFormValues>;
      if (from === 'saved') resetField(name);
      else setValue(name, shopForm.getValues(name), { shouldDirty: true });
    }
  }
  function addInherited(section: PolicySection) {
    fillSection(section, 'saved');
    setInherited((current) => (current.includes(section) ? current : [...current, section]));
  }
  /**
   * Bật/tắt "Áp dụng chính sách của gian hàng" của MỘT mục (web `setSectionInherited`). Bật lại một
   * mục đang RIÊNG (đã lưu) thì hỏi trước; tắt mà xe chưa có dòng riêng thì bắt đầu từ số của gian hàng.
   */
  function setSectionInherited(section: PolicySection, next: boolean, label: string) {
    if (!next) {
      if (!pricing.ownPolicy) fillSection(section, 'shop');
      setInherited((current) => current.filter((item) => item !== section));
      return;
    }
    if (savedInherited.includes(section)) {
      addInherited(section);
      return;
    }
    setPending({ kind: 'sectionReset', section, label });
  }
  const inheritControl = (section: PolicySection, label: string) =>
    direct
      ? undefined
      : {
          checked: isInherited(section),
          disabled: !canEdit || save.isPending,
          onChange: (next: boolean) => setSectionInherited(section, next, label),
          ...(shopPolicyHref ? { onOpenPolicies: () => navigateOnce(shopPolicyHref) } : {}),
        };

  const policyDirty = Object.keys(formState.dirtyFields).some((field) => !PRICE_FIELDS.has(field));
  useEffect(() => {
    policyDirtyRef.current = policyDirty;
  }, [policyDirty]);

  /*
   * Form CON có nút Lưu riêng (thời gian giao nhận, điều khoản, tự nhận chuyến) cũng là thay đổi chưa
   * lưu — trước 17/11/2026 chặn rời trang chỉ nhìn form giá nên sửa dở điều khoản rồi đổi tab là mất.
   */
  const [subDirty, setSubDirty] = useState<Readonly<Record<string, boolean>>>({});
  const reportSubDirty = useCallback(
    (key: string) => (dirty: boolean) =>
      setSubDirty((prev) => (prev[key] === dirty ? prev : { ...prev, [key]: dirty })),
    [],
  );
  const subReporters = useMemo(
    () => ({
      autoToggle: reportSubDirty('autoToggle'),
      autoExtras: reportSubDirty('autoExtras'),
      handover: reportSubDirty('handover'),
      termsSelf: reportSubDirty('termsSelf'),
      termsDriver: reportSubDirty('termsDriver'),
    }),
    [reportSubDirty],
  );
  const anySubDirty = Object.values(subDirty).some(Boolean);

  /*
   * Tab "Chính sách thuê": MỘT nút Lưu như web `PolicyPane` (người dùng chốt 17/11/2026) - form con
   * (thời gian giao nhận, điều khoản từng dịch vụ) đăng ký hàm lưu ở đây và ẩn nút riêng.
   */
  const subSavers = useRef<Record<string, SubFormSave>>({});
  const registerSubSave = useCallback(
    (key: string) => (save: SubFormSave | null) => {
      if (save) subSavers.current[key] = save;
      else delete subSavers.current[key];
    },
    [],
  );
  const subRegistrars = useMemo(
    () => ({
      handover: registerSubSave('handover'),
      autoExtras: registerSubSave('autoExtras'),
      termsSelf: registerSubSave('termsSelf'),
      termsDriver: registerSubSave('termsDriver'),
    }),
    [registerSubSave],
  );
  const [subSaving, setSubSaving] = useState(false);
  /* Đổi khoá ⇒ form thời gian chết dựng lại từ số đã lưu (nút Hoàn tác). */
  const [handoverKey, setHandoverKey] = useState(0);
  /* Hai tab có nút Lưu chung gộp cả form con (Dịch vụ xe: thẻ "Khác" có tài xế). */
  const subSavePane = policyPane || servicesPane;
  const leave = useLeaveGuard(formState.isDirty || anySubDirty);
  const refresh = useFormRefresh(formState.isDirty, refreshing, onRefetch);

  /* `useWatch` để bảng gợi ý giá gói chạy theo TỪNG phím gõ. */
  const watchedWeekday = useWatch({ control, name: 'weekdayPrice' });
  const watchedMonthly = useWatch({ control, name: 'monthlyPrice' });
  const watchedTiers = useWatch({ control, name: 'discountTiers' });
  const watchedDiscountEnabled = useWatch({ control, name: 'discountEnabled' });

  function commit(body: SaveVehiclePricingInput) {
    save.mutate(body, {
      onSuccess: () => {
        setPending(null);
        // Web: cả hai khu nói `Vehicles.edit.pricingTab.saved`, kể cả lần đặt lại theo gian hàng.
        toast.showSuccess(tSaved('saved'));
      },
      onError: (error) => {
        setPending(null);
        // Lỗi dịch theo MÃ ở cả hai khu (ADR 0012).
        toast.showError(errorMessage(error));
      },
    });
  }

  const submit = handleSubmit((values) => {
    /* `null` tường minh = XOÁ giá đó; chỉ gửi nhóm giá của dịch vụ xe đang đăng. */
    const money = (v: number | null | undefined): string | null =>
      v != null ? String(Math.round(v)) : null;

    /*
     * Web `buildBody` (ADR 0112): `switch` - còn mục riêng ⇒ ghi dòng theo xe kèm danh sách mục kế
     * thừa; đủ năm mục kế thừa ⇒ `shop` (server xoá dòng riêng). `direct` - chỉ ghi khi một ô chính
     * sách THẬT SỰ đổi, riêng toàn bộ. Chế độ chỉ-giá giữ nguyên nguồn và các mục đang có.
     */
    const sendPolicy = shouldSendPolicy({ overriding, showPolicy, direct, policyDirty, editMode });
    const sections: PolicySection[] =
      direct && !overriding ? [] : [...(showPolicy && !direct ? inherited : savedInherited)];
    const body: SaveVehiclePricingInput = {
      source: sendPolicy ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
      ...(sendPolicy ? { inheritedSections: sections } : {}),
      ...(hasSelfDrive || values.weekdayPrice != null
        ? { weekdayPrice: money(values.weekdayPrice) ?? '0' }
        : {}),
      weekendPrice: money(values.weekendPrice),
      hourlyPrice: money(values.hourlyPrice),
      ...(hasSelfDrive
        ? {
            discountPercent:
              values.discountPercent != null && values.discountPercent > 0
                ? Math.round(values.discountPercent)
                : null,
          }
        : {}),
      ...(hasLongTerm ? { monthlyPrice: money(values.monthlyPrice) } : {}),
      ...(hasWithDriver
        ? {
            withDriverDailyPrice: money(values.withDriverDailyPrice),
            withDriverInterCityPrice: money(values.withDriverInterCityPrice),
            withDriverOneWayPrice: money(values.withDriverOneWayPrice),
          }
        : {}),
      ...(sendPolicy ? { policy: formToSaveInput(values) } : {}),
    };

    // Chế độ `direct` không nói về "chính sách gian hàng" — chủ xe không có trang đó.
    setPending({
      kind: direct ? 'owner' : sendPolicy && showPolicy ? 'override' : 'inherit',
      body,
    });
  }, (errors) => {
    /*
     * Web `PolicyPane onInvalid`: ô giá ở mục "Dịch vụ & giá" lỗi (chưa có giá ngày thường…) cũng
     * chặn lượt lưu ở đây - nói rõ phải mở mục nào thay vì một nút Lưu im lặng.
     */
    if (policyPane && Object.keys(errors).some((field) => !POLICY_FIELDS.has(field))) {
      toast.showInfo(tPolicyEditor('pricesInvalid'));
    }
  });

  /**
   * Lưu cả tab: form con trước, LẦN LƯỢT (dừng ở form lỗi đầu tiên, lỗi hiện tại ô / toast của nó),
   * không toast riêng - một toast chung. Sau đó form giá/chính sách, vốn có hộp xác nhận riêng: huỷ
   * hộp đó thì phần form con đã lưu vẫn giữ (chúng là các bản ghi độc lập, như web `PolicyPane`).
   */
  async function saveAll() {
    const pricingDirty = formState.isDirty || (showPolicy && !direct && inheritedChanged);
    if (subSavePane && anySubDirty) {
      setSubSaving(true);
      try {
        for (const run of Object.values(subSavers.current)) {
          if (!(await run())) return;
        }
      } finally {
        setSubSaving(false);
      }
      if (!pricingDirty) toast.showSuccess(tPolicyEditor('savedAll'));
    }
    if (pricingDirty) void submit();
  }

  const dialog =
    pending === null
      ? null
      : pending.kind === 'reset'
        ? {
            title: t('source.resetTitle'),
            message: t('source.resetBody'),
            confirmLabel: t('source.resetOk'),
            cancelLabel: t('source.resetCancel'),
            destructive: true,
            onConfirm: () => {
              commit({ source: POLICY_SOURCE.SHOP });
            },
          }
        : pending.kind === 'sectionReset'
          ? {
              title: t('source.sectionResetTitle'),
              message: t('source.sectionResetBody', { section: pending.label }),
              confirmLabel: t('source.resetOk'),
              cancelLabel: t('source.resetCancel'),
              destructive: true,
              onConfirm: () => {
                addInherited(pending.section);
                setPending(null);
              },
            }
          : {
            title: confirmTitle(t, pending.kind),
            message: confirmBody(t, pending.kind, vehicleName),
            confirmLabel: t('confirm.ok'),
            cancelLabel: t('confirm.cancel'),
            destructive: false,
            onConfirm: () => commit(pending.body),
          };


  const saveButton = (
    <Button
      variant="gradient"
      label={tActions('saveChanges')}
      lineIcon="tick"
      loading={save.isPending || subSaving}
      /*
       * Chuyển nguồn kế thừa ↔ tuỳ chỉnh là thay đổi CẦN LƯU dù chưa gõ ô nào — so ý định
       * (`editMode`) với nguồn đã lưu (`overriding`). Tab chính sách tính cả form con.
       */
      disabled={
        !formState.isDirty &&
        !(showPolicy && !direct && inheritedChanged) &&
        !(subSavePane && anySubDirty)
      }
      onPress={() => void saveAll()}
    />
  );

  return (
    <>
      {customerScope ? (
        <AppHeader title={title} subtitle={label} onBack={() => leave.guard(onBack)} />
      ) : (
        <VehicleEditHeader
          vehicleId={vehicle.id}
          tab={policyPane ? VEHICLE_EDIT_TAB.POLICY : VEHICLE_EDIT_TAB.PRICING}
          title={tEdit('title')}
          guard={leave.guard}
          onBack={onBack}
        />
      )}
      <Screen
        scrollReveal={false}
        motion={false}
        edges={['left', 'right', 'bottom']}
        scrollRef={scrollRef}
        {...refresh}
        footer={
          canEdit ? (
            servicesPane || policyPane ? (
              /* Figma `24237:38746`: hai nút Hoàn tác · Lưu thay đổi dính đáy (như các màn sửa xe khác). */
              <XStack gap={space.sm}>
                <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                  <Button
                    label={tEdit('revert')}
                    variant="outline"
                    disabled={
                      !(formState.isDirty || inheritedChanged || (subSavePane && anySubDirty)) ||
                      save.isPending
                    }
                    onPress={() => {
                      reset(undefined, RESET_DISCARD);
                      setInherited(savedInherited);
                      // Form con (thời gian chết) tự giữ state - dựng lại là về đúng số đã lưu.
                      if (subSavePane) setHandoverKey((key) => key + 1);
                    }}
                  />
                </YStack>
                <YStack f={2}>
                  {saveButton}
                </YStack>
              </XStack>
            ) : (
              saveButton
            )
          ) : undefined
        }
      >
        <YStack gap={layout.section}>
          {/*
            Không có thẻ tóm tắt xe (ảnh, tên, hoàn thiện, trên chợ…) ở hai tab này - Figma `24237:38682`
            và `24238:57782` vào thẳng nội dung (người dùng chốt 27/11/2026).
          */}
          {legacyMerged || policyPane ? null : (
            <VehicleServiceToggles
              vehicle={vehicle}
              canEdit={canEdit}
              active={serviceTab}
              onSelect={setServiceTab}
              // Link trong câu gợi ý - mục Bảo hiểm & Giao nhận xe của ĐÚNG khu đang đứng.
              policyHref={
                customerScope
                  ? ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.POLICY)
                  : ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.POLICY)
              }
            >
              {/*
                Web `ServicesPane`: hàng "Nhận chuyến tự động" nằm NGAY dưới công tắc dịch vụ - Figma
                `24237:38685` gộp hai hàng chung một thẻ. Chỉ tab tự lái và khi dịch vụ đang bật (có
                tài xế không tự nhận - 19/11/2026, web PR #338).
              */}
              {servicesPane &&
              serviceTab === SERVICE_TYPE.SELF_DRIVE &&
              (services as readonly string[]).includes(serviceTab) ? (
                <AutoAcceptBody
                  vehicleId={vehicleId}
                  serviceType={serviceTab}
                  canEdit={canEdit}
                  part="toggle"
                  onDirtyChange={subReporters.autoToggle}
                />
              ) : null}
            </VehicleServiceToggles>
          )}
          {/* Tiêu đề + phụ đề của MỤC — `SectionCard` bao quanh workspace ở `VehiclePricingSection`. */}
          {legacyMerged ? (
            <YStack gap={space.xs}>
              <SectionHeader>{tSection('title')}</SectionHeader>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {tSection('subtitle')}
              </Text>
            </YStack>
          ) : null}

          {/* Web: cảnh báo giá tạm tính khi XE có dịch vụ có tài xế (đọc từ hồ sơ xe). */}
          {legacyMerged && vehicleServices.includes(SERVICE_TYPE.WITH_DRIVER) ? (
            <Callout tone="warning">{tSection('withDriverEstimateHint')}</Callout>
          ) : null}

          {renderPolicy && !direct && !policyPane ? (
            <Card lift="flat">
              <YStack gap={space.sm}>
                <SectionHeader icon="business-outline">{t('source.title')}</SectionHeader>
                <ToggleRow
                  label={t('source.useShop')}
                  checked={!editMode}
                  disabled={!canEdit || save.isPending}
                  onToggle={() => {
                    if (!editMode) {
                      // Tuỳ chỉnh toàn bộ: mọi mục riêng, bắt đầu từ số của gian hàng khi chưa có dòng riêng.
                      if (!pricing.ownPolicy) {
                        POLICY_SECTION_VALUES.forEach((section) => fillSection(section, 'shop'));
                      }
                      setInherited([]);
                      return;
                    }
                    // Đang ghi đè → về kế thừa. Bản ghi đè ĐÃ LƯU thì phải xác nhận xoá.
                    if (overriding) {
                      setPending({ kind: 'reset' });
                      return;
                    }
                    setInherited(POLICY_SECTION_VALUES);
                    reset(undefined, RESET_DISCARD);
                  }}
                />
                <Text col={editMode ? colors.warning : colors.textMuted} fos={fontSize.bodySm}>
                  {editMode
                    ? t('source.customBanner', { vehicle: label })
                    : t('source.inheritBanner')}
                </Text>
                {/* Link CHỈ hiện khi đang kế thừa và người dùng CÓ trang đó — như web. */}
                {editMode || !shopPolicyHref ? null : (
                  <BlockLink
                    label={t('source.viewShopPolicy')}
                    onPress={() => navigateOnce(shopPolicyHref)}
                  />
                )}
              </YStack>
            </Card>
          ) : null}

          {renderPolicy && !direct && !policyPane && overriding && canEdit ? (
            <Button
              icon="refresh-outline"
              label={t('source.reset')}
              variant="danger"
              size="sm"
              disabled={save.isPending}
              onPress={() => setPending({ kind: 'reset' })}
            />
          ) : null}

          {formState.isDirty && !servicesPane ? (
            <YStack bg={colors.warningSurface} br={radius.sm} p={space.sm} gap={space.xs}>
              <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('dirty')}
              </Text>
              <InlineAction label={t('discard')} onPress={() => reset(undefined, RESET_DISCARD)} />
            </YStack>
          ) : null}

          {showSelfDrive ? (
            <InfoGroupCard title={servicesPane ? tServices('price.titlePromo') : t('selfDrive.title')}>
              <MoneyField
                control={control}
                name="weekdayPrice"
                unit={t('unitPerDayApp')}
                label={t('selfDrive.weekdayApp')}
                hint={t('selfDrive.weekdayHint')}
                required
                editable={canEdit}
              />
              {/* Giá thuê tham khảo theo Dữ liệu xe (ADR 0090) - như web `ServicesPane`; bù 17/11/2026. */}
              <CatalogRentHintFor
                modelId={vehicle.vehicleCatalogModelId}
                variantId={vehicle.vehicleCatalogVariantId}
                year={vehicle.manufactureYear}
                vehicleId={vehicle.id}
                field="weekdayPrice"
                {...(canEdit
                  ? {
                      onApply: (price: number) =>
                        setValue('weekdayPrice', price, { shouldDirty: true, shouldValidate: true }),
                    }
                  : {})}
              />
              <MoneyField
                control={control}
                name="weekendPrice"
                unit={t('unitPerDayApp')}
                label={t('selfDrive.weekendApp')}
                hint={t('selfDrive.weekendHint')}
                editable={canEdit}
              />
              <MoneyField
                control={control}
                name="hourlyPrice"
                unit={t('unitPerHourApp')}
                label={t('selfDrive.hourlyApp')}
                hint={t('selfDrive.hourlyHint')}
                editable={canEdit}
              />
              <DirectDiscount control={control} canEdit={canEdit} />
            </InfoGroupCard>
          ) : null}

          {/*
            Hạn mức km + phụ phí quá giờ (ADR 0112 điều 4, web `ServicesPane`): áp cho chuyến tự lái,
            công tắc kế thừa của RIÊNG mục này. Dưới cùng là hình thức cọc đang áp, dẫn sang mục Bảo
            hiểm & Giao nhận - nơi đặt nó.
          */}
          {servicesPane && showSelfDrive && showPolicy ? (
            <VehiclePolicySectionCard
              title={tWorkspace('limits.title')}
              {...withInherit(
                inheritControl(POLICY_SECTION.USAGE_LIMITS, tWorkspace('limits.title')),
              )}
            >
              <PolicySections
                key={isInherited(POLICY_SECTION.USAGE_LIMITS) ? 'shop' : 'own'}
                control={sectionControl(POLICY_SECTION.USAGE_LIMITS)}
                disabled={!canEdit || save.isPending || isInherited(POLICY_SECTION.USAGE_LIMITS)}
                numbered={false}
                blocks={[POLICY_BLOCK.MILEAGE, POLICY_BLOCK.OVERTIME]}
                compact
              />
              <CollateralStrip
                control={sectionControl(POLICY_SECTION.COLLATERAL)}
                onOpen={() =>
                  navigateOnce(
                    customerScope
                      ? ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.POLICY)
                      : ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.POLICY),
                  )
                }
              />
            </VehiclePolicySectionCard>
          ) : null}

          {showLongTerm ? (
            <InfoGroupCard title={servicesPane ? tServices('price.title') : t('longTerm.title')}>
              <MoneyField
                control={control}
                name="monthlyPrice"
                unit={t('unitPerMonthApp')}
                label={t('longTerm.monthly')}
                hint={t('longTerm.monthlyHint', {
                  packages: LONG_TERM_PACKAGE_MONTHS.join(', '),
                })}
                editable={canEdit}
              />
              <LongTermPriceHint
                weekdayPrice={watchedWeekday}
                monthlyPrice={watchedMonthly}
                discountTiers={watchedTiers}
                discountEnabled={watchedDiscountEnabled}
                preview={servicesPane}
                /* Thẻ ưu đãi bên dưới đã có khung "Công thức tính giá gói" nói đúng câu đề xuất này. */
                hideSuggestion={servicesPane && !customerScope && showPolicy}
              />
            </InfoGroupCard>
          ) : null}

          {/*
            Web `ServicesPane` tab Dài hạn: thẻ "Ưu đãi thuê dài hạn" (mốc ưu đãi + xem trước giá gói)
            nằm Ở ĐÂY, không ở mục Chính sách thuê. Đang theo chính sách gian hàng thì chỉ đọc kèm
            lời dẫn sang công tắc ở mục Chính sách thuê.
          */}
          {/* Tuyến hoa hồng không có thẻ này (web `isManage ? … : null`). */}
          {servicesPane && showLongTerm && !customerScope && showPolicy ? (
            <VehiclePolicySectionCard
              title={tServices('policy.longTermTitle')}
              {...withInherit(
                inheritControl(
                  POLICY_SECTION.LONG_TERM_DISCOUNT,
                  tServices('policy.longTermTitle'),
                ),
              )}
            >
              <PolicySections
                key={isInherited(POLICY_SECTION.LONG_TERM_DISCOUNT) ? 'shop' : 'own'}
                control={sectionControl(POLICY_SECTION.LONG_TERM_DISCOUNT)}
                disabled={
                  !canEdit || save.isPending || isInherited(POLICY_SECTION.LONG_TERM_DISCOUNT)
                }
                numbered={false}
                blocks={[POLICY_BLOCK.DISCOUNT]}
                compact
                discountWeekdayPrice={watchedWeekday}
                legacyDiscountTiers={
                  (isInherited(POLICY_SECTION.LONG_TERM_DISCOUNT)
                    ? pricing.shopPolicy
                    : (pricing.ownPolicy ?? pricing.policy))?.legacyDiscountTiers
                }
              />
            </VehiclePolicySectionCard>
          ) : null}

          {showWithDriver ? (
            <InfoGroupCard title={servicesPane ? tServices('price.title') : t('withDriver.title')}>
              {/* Web `ServicesPane` (`!isManage`): cảnh báo giá tạm tính NGAY trong thẻ giá. */}
              {/* Web `WithDriverPriceReminder` (20/11/2026): giá có tài xế tuỳ chọn - nhắc khách đang thấy giá nào. */}
              {servicesPane ? <WithDriverPriceReminder control={control} /> : null}
              <MoneyField
                control={control}
                name="withDriverDailyPrice"
                unit={t('unitPerDayApp')}
                label={t('withDriver.daily')}
                hint={t('withDriver.dailyHint')}
                editable={canEdit}
              />
              {/* Giá thuê tham khảo theo Dữ liệu xe (ADR 0090) - như web `ServicesPane`; bù 17/11/2026. */}
              <CatalogRentHintFor
                modelId={vehicle.vehicleCatalogModelId}
                variantId={vehicle.vehicleCatalogVariantId}
                year={vehicle.manufactureYear}
                vehicleId={vehicle.id}
                field="withDriverDailyPrice"
                {...(canEdit
                  ? {
                      onApply: (price: number) =>
                        setValue('withDriverDailyPrice', price, { shouldDirty: true, shouldValidate: true }),
                    }
                  : {})}
              />
              <MoneyField
                control={control}
                name="withDriverInterCityPrice"
                unit={t('unitPerDayApp')}
                label={t('withDriver.interCity')}
                hint={t('withDriver.interCityHint')}
                editable={canEdit}
              />
              <MoneyField
                control={control}
                name="withDriverOneWayPrice"
                unit={t('unitPerDayApp')}
                label={t('withDriver.oneWay')}
                hint={t('withDriver.oneWayHint')}
                editable={canEdit}
              />
              {/* Giá trên là tiền KHÁCH trả; tiền công tài xế là mức chung của bên thuê (ADR 0075). */}
              <WithDriverWageNote />
            </InfoGroupCard>
          ) : null}

          {/* Web `WithDriverExtras`: thẻ "Khác" của có tài xế, sau thẻ giá. */}
          {servicesPane && (services as readonly string[]).includes(serviceTab) ? (
            <AutoAcceptBody
              key={handoverKey}
              vehicleId={vehicleId}
              serviceType={serviceTab}
              canEdit={canEdit}
              part="extras"
              onDirtyChange={subReporters.autoExtras}
              registerSave={subRegistrars.autoExtras}
            />
          ) : null}

          {showPolicy && policyPane ? (
            /*
              Web `PolicyPane` › `PolicyCards` (ADR 0112): mỗi mục một thẻ với công tắc kế thừa RIÊNG
              - bảo hiểm (ô tô, khi nền tảng bán theo bậc) · cọc · giao nhận - rồi thời gian chuẩn bị.
              Mục kế thừa vẽ số của gian hàng và khoá. Tuyến hoa hồng (`direct`) không có công tắc.
            */
            <>
              {insuranceApplies ? (
                <VehiclePolicySectionCard
                  title={tWorkspace('insurance.title')}
                  titleHint={tWorkspace('insurance.hint')}
                  {...withInherit(
                    inheritControl(POLICY_SECTION.INSURANCE, tWorkspace('insurance.title')),
                  )}
                >
                  <InsuranceModeBlock
                    key={isInherited(POLICY_SECTION.INSURANCE) ? 'shop' : 'own'}
                    control={sectionControl(POLICY_SECTION.INSURANCE)}
                    disabled={!canEdit || save.isPending || isInherited(POLICY_SECTION.INSURANCE)}
                    vehicle={{ vehicleId, gaps: insuranceStatus.data?.gaps ?? [] }}
                    headless
                  />
                </VehiclePolicySectionCard>
              ) : null}
              <VehiclePolicySectionCard
                title={tWorkspace('collateral.title')}
                subtitle={tWorkspace('collateral.subtitle')}
                {...withInherit(
                  inheritControl(POLICY_SECTION.COLLATERAL, tWorkspace('collateral.title')),
                )}
              >
                <CollateralPolicySection
                  key={isInherited(POLICY_SECTION.COLLATERAL) ? 'shop' : 'own'}
                  control={sectionControl(POLICY_SECTION.COLLATERAL)}
                  disabled={!canEdit || save.isPending || isInherited(POLICY_SECTION.COLLATERAL)}
                  bare
                  headless
                />
              </VehiclePolicySectionCard>
              <VehiclePolicySectionCard
                title={tWorkspace('delivery.title')}
                {...withInherit(
                  inheritControl(POLICY_SECTION.DELIVERY, tWorkspace('delivery.title')),
                )}
              >
                <DeliveryPolicySection
                  key={isInherited(POLICY_SECTION.DELIVERY) ? 'shop' : 'own'}
                  control={sectionControl(POLICY_SECTION.DELIVERY)}
                  disabled={!canEdit || save.isPending || isInherited(POLICY_SECTION.DELIVERY)}
                  bare
                  headless
                />
                {/*
                  Thời gian chết giữa hai chuyến nằm TRONG thẻ Giao nhận (Figma `24705:45807`, người dùng
                  chốt 27/11/2026) - vẫn là form + cơ chế "theo gian hàng" riêng của nó, không ăn theo
                  công tắc kế thừa của mục giao nhận.
                */}
                <RowDivider />
                <HandoverBody
                  key={handoverKey}
                  vehicleId={vehicleId}
                  canEdit={canEdit}
                  onDirtyChange={subReporters.handover}
                  registerSave={subRegistrars.handover}
                  bare
                />
              </VehiclePolicySectionCard>
            </>
          ) : null}

          {renderPolicy && !policyPane ? (
            // `direct`: khối chính sách luôn sửa được — không có thẻ tóm tắt chính sách gian hàng.
            editMode || direct ? (
              <PolicySections
                control={control as unknown as Parameters<typeof PolicySections>[0]['control']}
                disabled={!canEdit || save.isPending}
                numbered={false}
                legacyDiscountTiers={(pricing.policy ?? pricing.shopPolicy)?.legacyDiscountTiers}
                {...(insuranceApplies
                  ? {
                      afterRules: (
                        <InsuranceModeBlock
                          control={control as unknown as Parameters<typeof PolicySections>[0]['control']}
                          disabled={!canEdit || save.isPending}
                          vehicle={{ vehicleId, gaps: insuranceStatus.data?.gaps ?? [] }}
                        />
                      ),
                    }
                  : {})}
                {...(policyBlocks
                  ? { blocks: policyBlocks }
                  : policyPane
                    ? { blocks: OWNER_POLICY_BLOCKS }
                    : {})}
              />
            ) : (
              <InheritedPolicyCard
                policy={pricing.shopPolicy ? policyToForm(pricing.shopPolicy) : null}
                canEdit={canEdit}
                onEdit={() => {
                  if (!pricing.ownPolicy) {
                    POLICY_SECTION_VALUES.forEach((section) => fillSection(section, 'shop'));
                  }
                  setInherited([]);
                }}
                {...(policyBlocks
                  ? { blocks: policyBlocks }
                  : policyPane
                    ? { blocks: OWNER_POLICY_BLOCKS }
                    : {})}
              />
            )
          ) : null}

        </YStack>
      </Screen>

      {dialog ? (
        <AlertDialog
          open
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={dialog.cancelLabel}
          destructive={dialog.destructive}
          loading={save.isPending}
          onConfirm={dialog.onConfirm}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {/* Hộp "bỏ thay đổi chưa lưu?" — `useLeaveGuard` chỉ CHẶN, nó không tự vẽ gì. */}
      <AlertDialog
        open={leave.open}
        title={tEdit('discard.title')}
        message={tEdit('discard.body')}
        confirmLabel={tEdit('discard.ok')}
        cancelLabel={tEdit('discard.cancel')}
        destructive
        onConfirm={() => {
          reset(undefined, RESET_DISCARD);
          leave.confirm();
        }}
        onCancel={leave.cancel}
      />
    </>
  );
}

/** Trải `inherit` chỉ khi có - `exactOptionalPropertyTypes` không nhận `undefined` tường minh. */
const withInherit = (control: PolicyInheritControl | undefined) =>
  control ? { inherit: control } : {};

/**
 * "Hình thức cọc xe hiện tại: … - Thiết lập tại Bảo hiểm & Giao nhận" (web `CollateralStrip`). Đọc cọc
 * ĐANG ÁP: của gian hàng khi mục cọc kế thừa, của xe khi riêng - kể cả số đang gõ dở.
 */
function CollateralStrip({
  control,
  onOpen,
}: {
  control: Control<PolicyFormValues>;
  onOpen?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.editor.services');
  const describe = useDescribeCollateral();
  const [mode, cash, asset, combination, assetTypes, depositAmount] = useWatch({
    control,
    name: [
      'collateralMode',
      'collateralCashEnabled',
      'collateralAssetEnabled',
      'collateralCombination',
      'collateralAssetTypes',
      'depositAmount',
    ],
  });
  const text = describe(
    policyCollateral({
      collateralMode: mode,
      collateralCashEnabled: cash,
      collateralAssetEnabled: asset,
      collateralCombination: combination,
      collateralAssetTypes: assetTypes,
      depositAmount,
    }),
  );
  if (!text) return null;
  /* Figma `24705:45287`: nền `status/information-low`, chữ `status/information-high`, hàng link + mũi tên. */
  return (
    <YStack p={DISCOUNT_PAD} br={radius.control} bg={colors.infoLow} gap={space.sm}>
      <Text
        col={colors.infoStrong}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.medium}
      >
        {t('collateralNow', { collateral: text })}
      </Text>
      {onOpen ? (
        <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={t('collateralSetup')}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              col={colors.infoStrong}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.semibold}
            >
              {t('collateralSetup')}
            </Text>
            <LineIcon name="arrow-right" size={20} color={colors.infoStrong} />
          </XStack>
        </Pressable>
      ) : null}
    </YStack>
  );
}

type PricingTranslator = ReturnType<typeof useTranslations<'Vehicles.pricing'>>;
type ConfirmKind = 'owner' | 'override' | 'inherit';

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function confirmTitle(t: PricingTranslator, kind: ConfirmKind): string {
  if (kind === 'owner') return t('confirm.ownerTitle');
  if (kind === 'override') return t('confirm.overrideTitle');
  return t('confirm.inheritTitle');
}

function confirmBody(t: PricingTranslator, kind: ConfirmKind, vehicle: string): string {
  if (kind === 'owner') return t('confirm.ownerBody', { vehicle });
  if (kind === 'override') return t('confirm.overrideBody', { vehicle });
  return t('confirm.inheritBody', { vehicle });
}

/**
 * Khuyến mãi trực tiếp là thiết lập GIÁ riêng của xe, không phải bậc ưu đãi dài hạn.
 *
 * Khối xem trước dùng CÙNG công thức với thẻ xe và trang chi tiết sàn (`discountedPriceVnd`),
 * nên chủ xe không phải tự nhẩm giá sau giảm — và không có chỗ nào để hai con số lệch nhau.
 */
function DirectDiscount({
  control,
  canEdit,
}: {
  control: Control<VehiclePricingFormValues>;
  canEdit: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.pricing.discount');
  const fmt = useAppFormat();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });

  /* Không có cờ bật/tắt riêng trong DTO: mức giảm > 0 CHÍNH LÀ trạng thái bật. */
  const enabled = discountPercent != null && discountPercent > 0;

  const discountedWeekday = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  const saving =
    weekdayPrice != null && discountedWeekday != null
      ? Math.max(0, Math.round(weekdayPrice) - Number(discountedWeekday))
      : null;

  /*
   * Ghi qua CONTROLLER của ô (luôn đăng ký, kể cả khi ô % đang ẩn): `setValue` lên một trường chưa có
   * ô nào đăng ký không đánh dấu form "đã đổi" - bật khuyến mãi mà nút Lưu / Hoàn tác vẫn mờ.
   */
  const { field: percentField } = useController({ control, name: 'discountPercent' });
  const toggle = () =>
    // Bật thì mồi 10% như web - một ô rỗng bắt buộc ngay sau khi bật là một lỗi chờ sẵn.
    percentField.onChange(enabled ? null : DEFAULT_DISCOUNT_PERCENT);

  return (
    <>
      {/* Figma `24237:56919`: khung viền trong thẻ giá - công tắc + hai ô. */}
      <YStack bw={1} bc={colors.border} br={radius.control} p={DISCOUNT_PAD} gap={space.md}>
        <SwitchRow
          title={t('titleApp')}
          description={t('lead')}
          value={enabled}
          disabled={!canEdit}
          onChange={toggle}
        />
        {enabled ? (
          <XStack gap={DISCOUNT_PAD} ai="flex-start">
            {/*
              "Giảm giá theo": hiện chỉ giảm theo % - giảm theo số tiền để đợt sau (ADR 0112 "Để đợt
              sau"). Ô khoá ở "%", không bấm đổi được (người dùng chốt 27/11/2026).
            */}
            <YStack w={DISCOUNT_BY_WIDTH} gap={FIELD_LABEL_GAP}>
              <FieldLabel label={t('byLabel')} required />
              <FieldShell disabled>
                <Text f={1} py={space.sm} col={colors.text} fos={typeScale.body.fontSize}>
                  {t('byPercent')}
                </Text>
                <LineIcon name="chevron-down-md" size={20} color={colors.placeholder} />
              </FieldShell>
            </YStack>
            <YStack f={1} minWidth={0}>
              <NumberField
                control={control}
                name="discountPercent"
                percent
                label={t('percent')}
                hint={t('info')}
                required
                editable={canEdit}
              />
            </YStack>
          </XStack>
        ) : null}
      </YStack>

      {/* Figma `24237:56965`: "KHÁCH SẼ THẤY TRÊN SÀN" - nền vàng nhạt, ô giá trắng ở giữa. */}
      <YStack bg={colors.brandLow} br={radius.control} px={space.md} py={DISCOUNT_PAD} gap={DISCOUNT_PAD}>
        <YStack gap={2}>
          {/* HOA là quyết định TRÌNH BÀY - message giữ chữ thường, viết hoa ở đây. */}
          <Text
            col={colors.brandLink}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.semibold}
          >
            {t('previewEyebrow').toUpperCase()}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {t('lead')}
          </Text>
        </YStack>
        <YStack bg={colors.surface} br={radius.control} p={DISCOUNT_PAD} gap={space.xs} ai="center">
          {weekdayPrice == null ? (
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('previewEmpty')}
            </Text>
          ) : (
            <>
              {/* Giá gốc gạch ngang ở RIÊNG một dòng - nhồi chung với giá mới + nhãn thì vỡ dòng trên máy chữ to. */}
              {enabled && discountedWeekday ? (
                <Text
                  col={colors.placeholder}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  textDecorationLine="line-through"
                >
                  {fmt.money(String(weekdayPrice))}
                </Text>
              ) : null}
              <XStack ai="center" jc="center" gap={space.sm} flexWrap="wrap" rowGap={space.xs}>
                <XStack ai="flex-end" gap={2}>
                  <Text
                    col={colors.primary}
                    fos={typeScale.heading.fontSize}
                    lh={typeScale.heading.lineHeight}
                    fow={fontWeight.semibold}
                  >
                    {fmt.money(enabled && discountedWeekday ? discountedWeekday : String(weekdayPrice))}
                  </Text>
                  <Text
                    col={colors.placeholder}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    pb={2}
                  >
                    {t('perDay')}
                  </Text>
                </XStack>
                {enabled ? (
                  <YStack bg={colors.successSurface} br={radius.pill} px={space.sm} py={2}>
                    <Text
                      col={colors.success}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                      fow={fontWeight.medium}
                    >
                      {t('savingBadge', { percent: discountPercent ?? 0 })}
                    </Text>
                  </YStack>
                ) : null}
              </XStack>
              {enabled && saving != null ? (
                <Text
                  col={colors.text}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                  ta="center"
                >
                  {t('saving', { amount: fmt.money(String(saving)) })}
                </Text>
              ) : null}
            </>
          )}
        </YStack>
      </YStack>
    </>
  );
}

/** Figma "Discount Details": đệm 12; ô "Giảm giá theo" rộng 120. */
const DISCOUNT_PAD = 12;
const DISCOUNT_BY_WIDTH = 120;
/** Khoảng nhãn → ô của ô nhập v2 (Figma `_Select input base` gap 6). */
const FIELD_LABEL_GAP = 6;

/** Mức giảm mồi sẵn khi bật công tắc — cùng con số với web. */
const DEFAULT_DISCOUNT_PERCENT = 10;

/**
 * Chính sách ĐANG ÁP DỤNG khi xe kế thừa của gian hàng — bản native của `InheritedPolicyCard`.
 *
 * Bốn dòng tóm tắt, đúng bốn dòng web hiện. Bản trước chỉ có tiêu đề và một cái nút: chủ xe
 * phải bấm "tuỳ chỉnh riêng" MỚI biết mình đang kế thừa cái gì — tức phải phá thứ đang dùng để
 * xem nó là gì.
 */
function InheritedPolicyCard({
  policy,
  canEdit,
  onEdit,
  blocks,
}: {
  policy: PolicyFormValues | null;
  canEdit: boolean;
  onEdit: () => void;
  /** Cùng bộ khối với form — dòng quá giờ/ưu đãi của khối ẩn không hiện (như web). */
  blocks?: readonly PolicyBlock[];
}) {
  const colors = useColors();
  const shows = (block: PolicyBlock) => !blocks || blocks.includes(block);
  const t = useTranslations('Vehicles.pricing.inherited');
  const fmt = useAppFormat();

  const describeCollateral = useDescribeCollateral();
  // "Cọc tiền X hoặc Cọc tài sản (…)" - một câu chung mọi bề mặt (ADR 0112 điều 2).
  const collateral = () => (policy ? describeCollateral(policyCollateral(policy)) : null);

  const maxDiscount =
    policy?.discountEnabled && (policy.discountTiers ?? []).length > 0
      ? Math.max(...(policy.discountTiers ?? []).map((tier) => tier.percent ?? 0))
      : null;

  return (
    <Card lift="flat">
      <YStack gap={space.sm}>
        <SectionHeader>{t('title')}</SectionHeader>

        <XStack ai="center" gap={space.xs}>
          <StatusBadge
            label={policy ? t('badge') : t('badgeEmpty')}
            color={policy ? STATUS_COLOR.SUCCESS : STATUS_COLOR.WARNING}
            size="sm"
          />
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {policy ? t('subtitle') : t('subtitleEmpty')}
        </Text>

        {policy ? (
          <YStack gap={space.xs}>
            {/*
              `block` chứ không hai cột như bốn dòng dưới: giá trị ở đây là một câu GHÉP
              ("Cọc tài sản · Cà vẹt (đăng ký xe máy), Xe máy, Hộ chiếu") chứ không phải một
              con số. Nhét nó vào cột phải 40% bề ngang thì nó phải xuống ba dòng rồi bị cắt —
              mà cắt đúng cái danh sách giấy tờ khách phải mang theo là bỏ đi phần duy nhất
              chủ xe cần đọc. Cùng lựa chọn với các dòng địa chỉ ở màn yêu cầu thuê.
            */}
            <DataRow block label={t('collateral')} value={collateral() ?? ''} />
            <DataRow
              labelWide
              label={t('delivery')}
              value={
                policy.deliveryEnabled
                  ? t('deliveryOn', { count: (policy.deliveryTiers ?? []).length })
                  : t('deliveryOff')
              }
            />
            {/*
              Hai trường đi CẶP ở backend, nên chỉ cần một trường có mặt là đang có hạn mức.
              Đọc cả hai vẫn rẻ hơn việc hiện "Không giới hạn" cho một chiếc xe thật ra có hạn
              mức — dòng đó là thứ chủ xe tin để quyết định có ghi đè chính sách hay không.
            */}
            <DataRow
              labelWide
              label={t('mileage')}
              value={
                policy.includedDistanceKmPerDay != null && policy.excessDistanceFeePerKm != null
                  ? t('mileageValue', {
                      km: fmt.km(policy.includedDistanceKmPerDay),
                      fee: fmt.money(String(policy.excessDistanceFeePerKm)),
                    })
                  : t('mileageOff')
              }
            />
            {shows(POLICY_BLOCK.OVERTIME) ? (
              <DataRow
                labelWide
                label={t('overtime')}
                value={
                  policy.overtimeFeePerHour
                    ? t('overtimeValue', { fee: fmt.money(String(policy.overtimeFeePerHour)) })
                    : t('overtimeMissing')
                }
              />
            ) : null}
            {shows(POLICY_BLOCK.DISCOUNT) ? (
              <DataRow
                labelWide
                label={t('discount')}
                value={
                  maxDiscount == null
                    ? t('discountOff')
                    : t('discountMax', { percent: maxDiscount })
                }
              />
            ) : null}
          </YStack>
        ) : (
          /*
            `t.rich` chứ không `t`: câu này bọc tên trang chính sách trong thẻ <policies> để
            BÊN WEB biến nó thành liên kết. Cùng MỘT khoá cho hai client — tách làm hai khoá là
            hai bản dịch của cùng một câu, và chúng sẽ lệch nhau ở lần sửa chữ đầu tiên.
          */
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t.rich('emptyBody', {
              policies: (chunks) => (
                <Text col={colors.text} fow={fontWeight.semibold}>
                  {chunks}
                </Text>
              ),
            })}
          </Text>
        )}

        {canEdit ? <Button label={t('edit')} variant="outline" onPress={onEdit} /> : null}
      </YStack>
    </Card>
  );
}


/**
 * Nhắc chủ xe khách đang thấy giá nào cho chuyến có tài xế - bản native của web
 * `WithDriverPriceReminder` (ServicesPane, 20/11/2026). Giá có tài xế tuỳ chọn: thiếu giá nội thành
 * thì khách thấy giá thuê tự lái kèm "chưa gồm tài xế".
 */
function WithDriverPriceReminder({ control }: { control: Control<VehiclePricingFormValues> }) {
  const t = useTranslations('Vehicles.pricing.withDriver.reminder');
  const fmt = useAppFormat();
  const [daily, interCity, oneWay, weekday] = useWatch({
    control,
    name: ['withDriverDailyPrice', 'withDriverInterCityPrice', 'withDriverOneWayPrice', 'weekdayPrice'],
  });
  const has = (value: number | null | undefined) => value != null && value > 0;
  if (!has(daily)) {
    return (
      <Callout tone="warning" title={t('missingTitle')}>
        {has(weekday) ? t('missingBody', { price: fmt.money(String(weekday)) }) : t('missingNoPriceBody')}
      </Callout>
    );
  }
  if (!has(interCity) || !has(oneWay)) return <Callout tone="info">{t('partial')}</Callout>;
  return <Callout tone="success">{t('complete')}</Callout>;
}
