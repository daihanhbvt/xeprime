import { useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  COLLATERAL_MODE,
  LONG_TERM_PACKAGE_MONTHS,
  PERMISSION,
  POLICY_SOURCE,
  SERVICE_TYPE,
  type ServiceType,
  STATUS_COLOR,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MoneyField } from '@/components/ui/MoneyField';
import { LongTermPriceHint } from '@/features/rental-policies/components/LongTermPriceHint';
import type { PolicyFormValues } from '@/features/rental-policies/schema';
import { NumberField } from '@/components/ui/NumberField';
import { InlineAction } from '@/components/ui/InlineAction';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFormRefresh } from '@/hooks/use-form-refresh';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import {
  POLICY_BLOCK,
  PolicySections,
  ToggleRow,
  type PolicyBlock,
} from '@/features/rental-policies/components/PolicySections';
import { formToSaveInput, policyToForm } from '@/features/rental-policies/form';
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
 * Khối chính sách của chủ xe ở khu tài khoản — đúng ba khối web `VehiclePricingSection` truyền
 * (cọc · giao xe tận nơi · giới hạn km). Phí quá giờ và ưu đãi dài hạn ẩn nhưng vẫn gửi nguyên.
 */
export const OWNER_POLICY_BLOCKS: readonly PolicyBlock[] = [
  POLICY_BLOCK.COLLATERAL,
  POLICY_BLOCK.DELIVERY,
  POLICY_BLOCK.MILEAGE,
];

/**
 * Luật "có ghi bộ chính sách riêng không" — CHÉP NGUYÊN `sendPolicy` của web
 * `VehiclePricingWorkspace`. Tách thành hàm thuần để test khoá được.
 */
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
  return overriding || (showPolicy && (direct ? policyDirty : editMode));
}

/** Hộp xác nhận đang chờ — cùng một hộp thoại cho lưu và đặt lại. */
type Pending =
  | { kind: 'owner'; body: SaveVehiclePricingInput }
  | { kind: 'override'; body: SaveVehiclePricingInput }
  | { kind: 'inherit'; body: SaveVehiclePricingInput }
  | { kind: 'reset' }
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
   * Mở từ khu tài khoản: tiêu đề/phụ đề của MỤC "Giá & chính sách" (`VehicleManage.pricing`),
   * cảnh báo giá tạm tính khi xe có tài xế, không dải tab của cổng quản lý, lui về mục lục quản
   * lý xe, lỗi dịch theo MÃ (`useErrorMessage`), lịch giá ở khu tài khoản.
   */
  customerScope?: boolean;
}

export function VehiclePricingScreen({
  vehicleId,
  customerScope = false,
  ...config
}: VehiclePricingScreenProps) {
  const t = useTranslations('Vehicles.pricing');
  const tMenu = useTranslations('VehicleManage.menu');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);
  const title = customerScope ? tMenu('items.pricing') : t('title');

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
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={title} description={t('noPermission')} />
        </Screen>
      </>
    );
  }

  if (vehicle.isPending || pricing.isPending) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (vehicle.isError || pricing.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
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
}: Omit<VehiclePricingScreenProps, 'customerScope'> & {
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
  const tSection = useTranslations('VehicleManage.pricing');
  const t = useTranslations('Vehicles.pricing');
  const tSaved = useTranslations('Vehicles.edit.pricingTab');
  const tActions = useTranslations('Common.actions');
  /* Câu "bỏ thay đổi chưa lưu" là của TAB SỬA XE nói chung (`Vehicles.edit.discard`). */
  const tEdit = useTranslations('Vehicles.edit');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const save = useSaveVehiclePricing(vehicleId);

  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  // Bật form ghi đè TRƯỚC khi lưu lần đầu — state cục bộ, chỉ commit khi bấm Lưu.
  const [editingOverride, setEditingOverride] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const editMode = overriding || editingOverride;
  const showPolicy = policyMode === 'full';
  const direct = policySource === 'direct';
  /*
   * Chế độ `direct`: khối chính sách có ô bị đổi hay chưa — đọc lúc VALIDATE (getter của
   * `context`) và lúc lưu. Ref vì RHF đọc context ngoài render; đồng bộ trong effect (như web).
   */
  const policyDirtyRef = useRef(false);

  // Nhóm giá hiện theo NĂNG LỰC dịch vụ của xe — không trộn mọi ô giá thành một danh sách.
  const services = pricing.serviceTypes ?? [];
  const isVisible = (service: ServiceType) =>
    (services as readonly string[]).includes(service) &&
    (!visibleServices || visibleServices.includes(service));
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
  const { control, handleSubmit, reset, setValue, formState } = useForm<VehiclePricingFormValues>({
    resolver,
    /*
     * `policyEditable` tắt ràng buộc khối CHÍNH SÁCH khi các ô đó không được sửa — đúng getter
     * của web: `showPolicy && (editMode || (direct && policyDirty))`. Ở chế độ `direct` không có
     * công tắc mở khoá, nên ràng buộc bật khi chủ xe THẬT SỰ sửa một ô chính sách.
     */
    context: {
      serviceTypes: services,
      get policyEditable() {
        return showPolicy && (editMode || (direct && policyDirtyRef.current));
      },
    },
    /* Giữ ô đang gõ khi dữ liệu server đổi — cùng luật với hai màn form còn lại. */
    resetOptions: { keepDirtyValues: true },
    values: {
      ...policyToForm(pricing.policy ?? pricing.shopPolicy),
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

  const policyDirty = Object.keys(formState.dirtyFields).some((field) => !PRICE_FIELDS.has(field));
  useEffect(() => {
    policyDirtyRef.current = policyDirty;
  }, [policyDirty]);

  const leave = useLeaveGuard(formState.isDirty);
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
        setEditingOverride(false);
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

    const sendPolicy = shouldSendPolicy({ overriding, showPolicy, direct, policyDirty, editMode });
    const body: SaveVehiclePricingInput = {
      source: sendPolicy ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
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
  });

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
              setEditingOverride(false);
              commit({ source: POLICY_SOURCE.SHOP });
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

  const calendarHref = vehicleSchedulePath(
    { name: vehicleName, plateNumber: vehiclePlate },
    { back: true, customerScope },
  );

  return (
    <>
      <AppHeader title={title} subtitle={label} onBack={() => leave.guard(onBack)} />
      <Screen
        edges={['left', 'right', 'bottom']}
        {...refresh}
        footer={
          canEdit ? (
            <Button
              label={tActions('saveChanges')}
              icon="save-outline"
              loading={save.isPending}
              /*
               * Chuyển nguồn kế thừa ↔ tuỳ chỉnh là thay đổi CẦN LƯU dù chưa gõ ô nào — so ý định
               * (`editMode`) với nguồn đã lưu (`overriding`).
               */
              disabled={!formState.isDirty && editMode === overriding}
              onPress={() => void submit()}
            />
          ) : undefined
        }
      >
        <YStack gap={layout.section}>
          {/* Tiêu đề + phụ đề của MỤC — `SectionCard` bao quanh workspace ở `VehiclePricingSection`. */}
          {customerScope ? (
            <YStack gap={space.xs}>
              <BlockTitle>{tSection('title')}</BlockTitle>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {tSection('subtitle')}
              </Text>
            </YStack>
          ) : null}

          {/* Web: cảnh báo giá tạm tính khi XE có dịch vụ có tài xế (đọc từ hồ sơ xe). */}
          {customerScope && vehicleServices.includes(SERVICE_TYPE.WITH_DRIVER) ? (
            <Callout tone="warning">{tSection('withDriverEstimateHint')}</Callout>
          ) : null}

          {showPolicy && !direct ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('source.title')}</BlockTitle>
                <ToggleRow
                  label={t('source.useShop')}
                  checked={!editMode}
                  disabled={!canEdit || save.isPending}
                  onToggle={() => {
                    if (!editMode) {
                      setEditingOverride(true);
                      return;
                    }
                    // Đang ghi đè → về kế thừa. Bản ghi đè ĐÃ LƯU thì phải xác nhận xoá.
                    if (overriding) {
                      setPending({ kind: 'reset' });
                      return;
                    }
                    setEditingOverride(false);
                    reset();
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

          {showPolicy && !direct && overriding && canEdit ? (
            <Button
              label={t('source.reset')}
              variant="danger"
              size="sm"
              disabled={save.isPending}
              onPress={() => setPending({ kind: 'reset' })}
            />
          ) : null}

          {formState.isDirty ? (
            <YStack bg={colors.warningSurface} br={radius.sm} p={space.sm} gap={space.xs}>
              <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('dirty')}
              </Text>
              <InlineAction label={t('discard')} onPress={() => reset()} />
            </YStack>
          ) : null}

          {showSelfDrive ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('selfDrive.title')}</BlockTitle>
                <MoneyField
                  control={control}
                  name="weekdayPrice"
                  unit={t('unitPerDay')}
                  label={t('selfDrive.weekday')}
                  hint={t('selfDrive.weekdayHint')}
                  required
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="weekendPrice"
                  unit={t('unitPerDay')}
                  label={t('selfDrive.weekend')}
                  hint={t('selfDrive.weekendHint')}
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="hourlyPrice"
                  unit={t('unitPerHour')}
                  label={t('selfDrive.hourly')}
                  hint={t('selfDrive.hourlyHint')}
                  editable={canEdit}
                />
                <DirectDiscount control={control} setValue={setValue} canEdit={canEdit} />
                <CalendarPriceLink href={calendarHref} />
              </YStack>
            </Card>
          ) : null}

          {showLongTerm ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('longTerm.title')}</BlockTitle>
                <MoneyField
                  control={control}
                  name="monthlyPrice"
                  unit={t('unitPerMonth')}
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
                />
              </YStack>
            </Card>
          ) : null}

          {showWithDriver ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('withDriver.title')}</BlockTitle>
                <MoneyField
                  control={control}
                  name="withDriverDailyPrice"
                  unit={t('unitPerDay')}
                  label={t('withDriver.daily')}
                  hint={t('withDriver.dailyHint')}
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="withDriverInterCityPrice"
                  unit={t('unitPerDay')}
                  label={t('withDriver.interCity')}
                  hint={t('withDriver.interCityHint')}
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="withDriverOneWayPrice"
                  unit={t('unitPerDay')}
                  label={t('withDriver.oneWay')}
                  hint={t('withDriver.oneWayHint')}
                  editable={canEdit}
                />
                <CalendarPriceLink href={calendarHref} />
              </YStack>
            </Card>
          ) : null}

          {showPolicy ? (
            // `direct`: khối chính sách luôn sửa được — không có thẻ tóm tắt chính sách gian hàng.
            editMode || direct ? (
              <PolicySections
                control={control as unknown as Parameters<typeof PolicySections>[0]['control']}
                disabled={!canEdit || save.isPending}
                numbered={false}
                legacyDiscountTiers={(pricing.policy ?? pricing.shopPolicy)?.legacyDiscountTiers}
                {...(policyBlocks ? { blocks: policyBlocks } : {})}
              />
            ) : (
              <InheritedPolicyCard
                policy={pricing.shopPolicy ? policyToForm(pricing.shopPolicy) : null}
                canEdit={canEdit}
                onEdit={() => setEditingOverride(true)}
                {...(policyBlocks ? { blocks: policyBlocks } : {})}
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
          reset();
          leave.confirm();
        }}
        onCancel={leave.cancel}
      />
    </>
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
  setValue,
  canEdit,
}: {
  control: Control<VehiclePricingFormValues>;
  setValue: UseFormSetValue<VehiclePricingFormValues>;
  canEdit: boolean;
}) {
  const t = useTranslations('Vehicles.pricing.discount');
  const fmt = useAppFormat();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const weekendPrice = useWatch({ control, name: 'weekendPrice' });
  const hourlyPrice = useWatch({ control, name: 'hourlyPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });

  /* Không có cờ bật/tắt riêng trong DTO: mức giảm > 0 CHÍNH LÀ trạng thái bật. */
  const enabled = discountPercent != null && discountPercent > 0;

  const discountedWeekday = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  const discountedWeekend = discountedPriceVnd(
    weekendPrice == null ? null : String(weekendPrice),
    discountPercent,
  );
  const saving =
    weekdayPrice != null && discountedWeekday != null
      ? Math.max(0, Math.round(weekdayPrice) - Number(discountedWeekday))
      : null;

  return (
    <YStack gap={space.sm}>
      <ToggleRow
        label={t('title')}
        checked={enabled}
        disabled={!canEdit}
        onToggle={() =>
          // Bật thì mồi 10% như web — một ô rỗng bắt buộc ngay sau khi bật là một lỗi chờ sẵn.
          setValue('discountPercent', enabled ? null : DEFAULT_DISCOUNT_PERCENT, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      />
      {/* Web treo câu này trong tooltip; native không có hover nên nó thành dòng phụ. */}
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('info')}
      </Text>

      {enabled ? (
        <YStack gap={space.xs}>
          <NumberField
            control={control}
            name="discountPercent"
            percent
            label={t('percent')}
            editable={canEdit}
          />
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('percentInfo')}
          </Text>
        </YStack>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('offHint')}
        </Text>
      )}

      <Card tone="accent" lift="flat">
        <YStack gap={space.xs}>
          {/* HOA là quyết định TRÌNH BÀY — message giữ chữ thường, viết hoa ở đây. */}
          <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
            {t('previewEyebrow').toUpperCase()}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('previewLabel')}
          </Text>

          {weekdayPrice == null ? (
            <Text col={colors.placeholder} fos={fontSize.bodySm}>
              {t('previewEmpty')}
            </Text>
          ) : enabled && discountedWeekday ? (
            <>
              <XStack ai="center" gap={space.xs}>
                <Text
                  col={colors.textMuted}
                  fos={fontSize.bodySm}
                  textDecorationLine="line-through"
                >
                  {fmt.money(String(weekdayPrice))}
                </Text>
                <XStack bg={colors.discount} br={radius.sm} px={space.sm} py={2}>
                  <Text col={colors.onDiscount} fos={fontSize.label} fow={fontWeight.bold}>
                    -{discountPercent}%
                  </Text>
                </XStack>
              </XStack>
              <PreviewPrice amount={fmt.money(discountedWeekday)} suffix={t('perDay')} />
              {saving != null ? (
                <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {t('saving', { amount: fmt.money(String(saving)) })}
                </Text>
              ) : null}
            </>
          ) : (
            <PreviewPrice amount={fmt.money(String(weekdayPrice))} suffix={t('perDay')} />
          )}

          {enabled && discountedWeekend ? (
            <PreviewLine label={t('weekendAfter')} value={fmt.pricePerDay(discountedWeekend)} />
          ) : null}
          {hourlyPrice != null ? (
            <PreviewLine
              label={t('hourlyNoDiscount')}
              value={fmt.pricePerHour(String(hourlyPrice))}
            />
          ) : null}
        </YStack>
      </Card>
    </YStack>
  );
}

/** Mức giảm mồi sẵn khi bật công tắc — cùng con số với web. */
const DEFAULT_DISCOUNT_PERCENT = 10;

/** Con số lớn của khối xem trước: tiền nổi bật, đơn vị nhỏ đi kèm — đúng `<small>` của web. */
function PreviewPrice({ amount, suffix }: { amount: string; suffix: string }) {
  return (
    <XStack ai="flex-end" gap={space.xs}>
      <Text col={colors.price} fos={fontSize.h3} fow={fontWeight.bold}>
        {amount}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.bodySm} pb={2}>
        {suffix}
      </Text>
    </XStack>
  );
}

/** Dòng phụ của khối xem trước — giá cuối tuần sau giảm, giá theo giờ không giảm. */
function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <YStack gap={2} pt={space.xs}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {value}
      </Text>
    </YStack>
  );
}

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
  const shows = (block: PolicyBlock) => !blocks || blocks.includes(block);
  const t = useTranslations('Vehicles.pricing.inherited');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const collateral = () => {
    if (!policy) return null;
    if (policy.collateralMode === COLLATERAL_MODE.CASH) {
      return `${domainLabel('collateralMode', policy.collateralMode)}${LIST_SEPARATOR}${fmt.money(
        String(policy.depositAmount ?? 0),
      )}`;
    }
    if (policy.collateralMode === COLLATERAL_MODE.ASSET) {
      const types = (policy.collateralAssetTypes ?? [])
        .map((type) => domainLabel('collateralAssetType', type))
        .join(', ');
      return `${domainLabel('collateralMode', policy.collateralMode)}${LIST_SEPARATOR}${
        types || t('assetNone')
      }`;
    }
    return domainLabel('collateralMode', policy.collateralMode);
  };

  const maxDiscount =
    policy?.discountEnabled && (policy.discountTiers ?? []).length > 0
      ? Math.max(...(policy.discountTiers ?? []).map((tier) => tier.percent ?? 0))
      : null;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('title')}</BlockTitle>

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

        {canEdit ? <Button label={t('edit')} variant="secondary" onPress={onEdit} /> : null}
      </YStack>
    </Card>
  );
}

/**
 * Lối sang lịch xe để đặt giá riêng theo ngày — bản native của `CalendarPriceLink` bên web.
 *
 * Ở CẢ hai khối giá (tự lái · có tài xế), đúng hai chỗ web đặt nó. Lý do nó tồn tại quan trọng
 * hơn chỗ đặt: giá lễ/cuối tuần/mùa cao điểm chỉ có MỘT nguồn là lịch xe, nên màn này phải chỉ
 * đường sang đó thay vì mọc thêm một bảng giá mùa vụ thứ hai.
 *
 * Lọc theo biển số như mọi lối "Xem lịch" khác (`vehicleSchedulePath` của web).
 */
function CalendarPriceLink({ href }: { href: Href }) {
  const t = useTranslations('Vehicles.pricing');
  const navigateOnce = useNavigateOnce();

  return (
    <YStack gap={space.xs}>
      <InlineAction label={t('calendarLink')} onPress={() => navigateOnce(href)} />
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('calendarHint')}
      </Text>
    </YStack>
  );
}
