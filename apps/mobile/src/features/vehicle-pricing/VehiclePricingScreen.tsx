import { useState } from 'react';
import { useRouter } from 'expo-router';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  COLLATERAL_MODE,
  LONG_TERM_PACKAGE_MONTHS,
  PERMISSION,
  POLICY_SOURCE,
  SERVICE_TYPE,
  STATUS_COLOR,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { VehicleEditTabs } from '@/features/vehicles/components/VehicleEditTabs';
import { Button } from '@/components/ui/Button';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MoneyField } from '@/components/ui/MoneyField';
import { LongTermPriceHint } from './components/LongTermPriceHint';
import type { PolicyFormValues } from './schema';
import { NumberField } from '@/components/ui/NumberField';
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
import { goBackOr } from '@/navigation/go-back-or';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { PolicySections, ToggleRow } from './components/PolicySections';
import { formToSaveInput, policyToForm } from './form';
import { vehiclePricingFormSchema, type VehiclePricingFormValues } from './schema';
import { useSaveVehiclePricing, useVehiclePricing } from './hooks/use-vehicle-pricing';
import type { SaveVehiclePricingInput, VehiclePricing } from './api';

const toNumber = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/** Hộp xác nhận đang chờ — bốn câu chuyện khác nhau, cùng một hộp thoại. */
type Pending =
  | { kind: 'public'; body: SaveVehiclePricingInput }
  | { kind: 'override'; body: SaveVehiclePricingInput }
  | { kind: 'inherit'; body: SaveVehiclePricingInput }
  | { kind: 'reset' }
  | null;

/**
 * Giá & chính sách theo XE (VEH-05).
 *
 * Hai chế độ, y như web:
 *  - **Kế thừa**: chính sách đọc từ gian hàng; đổi ở màn Cấu hình gian hàng là tự áp cho xe này.
 *  - **Ghi đè**: lưu một bộ chính sách riêng. "Đặt lại theo gian hàng" XOÁ bản ghi đè.
 *
 * Khối GIÁ luôn hiện — giá là thuộc tính của xe, không phụ thuộc nguồn chính sách. Chỉ khối
 * CHÍNH SÁCH mới đổi theo chế độ; gộp chung là muốn sửa mỗi giá cũng phải ghi đè toàn bộ.
 *
 * Xe đang công khai mà đổi GIÁ sẽ bị đưa về chờ duyệt lại và tạm ẩn khỏi sàn (ADR 0008) — hộp
 * xác nhận nói đúng hệ quả đó, không hứa "áp dụng ngay".
 */
export function VehiclePricingScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.pricing');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_VIEW);

  const back = () => goBackOr(router, ROUTES.manage.vehicleDetail(vehicleId));
  const vehicle = useVehicle(vehicleId, canView);
  const pricing = useVehiclePricing(vehicleId, canView);

  if (!permissionsLoading && !canView) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('title')}
            description={t('noPermission')}
          />
        </Screen>
      </>
    );
  }

  if (vehicle.isPending || pricing.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (vehicle.isError || pricing.isError) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
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
      vehicleName={vehicle.data.name}
      vehiclePlate={vehicle.data.plateNumber ?? null}
      pricing={pricing.data}
      canEdit={has(PERMISSION.VEHICLE_UPDATE)}
      onBack={back}
      refreshing={vehicle.isRefetching || pricing.isRefetching}
      onRefetch={() => {
        void vehicle.refetch();
        void pricing.refetch();
      }}
    />
  );
}

function VehiclePricingForm({
  vehicleId,
  vehicleName,
  vehiclePlate,
  pricing,
  canEdit,
  onBack,
  refreshing,
  onRefetch,
}: {
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string | null;
  pricing: VehiclePricing;
  canEdit: boolean;
  onBack: () => void;
  refreshing: boolean;
  onRefetch: () => void;
}) {
  const t = useTranslations('Vehicles.pricing');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const tStates = useTranslations('Common.states');
  const errorMessage = useErrorMessage();
  const save = useSaveVehiclePricing(vehicleId);

  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  // Bật form ghi đè TRƯỚC khi lưu lần đầu — state cục bộ, chỉ commit khi bấm Lưu.
  const [editingOverride, setEditingOverride] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const editMode = overriding || editingOverride;

  // Nhóm giá hiện theo NĂNG LỰC dịch vụ của xe — không trộn mọi ô giá thành một danh sách.
  const services = pricing.serviceTypes ?? [];
  const hasSelfDrive = services.includes(SERVICE_TYPE.SELF_DRIVE);
  const hasLongTerm = services.includes(SERVICE_TYPE.LONG_TERM);
  const hasWithDriver = services.includes(SERVICE_TYPE.WITH_DRIVER);

  const label = vehiclePlate ? `${vehicleName} (${vehiclePlate})` : vehicleName;

  const { control, handleSubmit, reset, setValue, formState } = useForm<VehiclePricingFormValues>({
    resolver: yupResolver(vehiclePricingFormSchema),
    /*
     * Giá ngày thường chỉ bắt buộc khi xe đăng tự lái. `policyEditable` tắt mọi ràng buộc của
     * khối CHÍNH SÁCH khi xe đang kế thừa: các ô đó không hiện ra để sửa nên không được phép chặn
     * nút Lưu — thiếu cờ này thì một gian hàng CHƯA cấu hình chính sách sẽ không bao giờ đặt nổi
     * giá cho xe, vì form đòi tiền cọc trên một ô vô hình.
     */
    context: { serviceTypes: services, policyEditable: editMode },
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

  const leave = useLeaveGuard(formState.isDirty);
  const refresh = useFormRefresh(formState.isDirty, refreshing, onRefetch);

  /*
   * `useWatch` chứ không đọc `getValues()`: khối gợi ý phải chạy theo TỪNG phím gõ — đó là công
   * dụng của nó. `getValues` không kích hoạt render nên bảng gói sẽ đứng im ở giá cũ.
   */
  const watchedWeekday = useWatch({ control, name: 'weekdayPrice' });
  const watchedMonthly = useWatch({ control, name: 'monthlyPrice' });
  const watchedTiers = useWatch({ control, name: 'discountTiers' });
  const watchedDiscountEnabled = useWatch({ control, name: 'discountEnabled' });

  function commit(body: SaveVehiclePricingInput, backToShop = false) {
    save.mutate(body, {
      onSuccess: () => {
        setPending(null);
        setEditingOverride(false);
        toast.showSuccess(backToShop ? t('savedShop') : t('saved'));
      },
      onError: (error) => {
        setPending(null);
        toast.showError(errorMessage(error));
      },
    });
  }

  const submit = handleSubmit((values) => {
    /*
     * `null` tường minh = XOÁ giá đó (server nhận null-clear). Chỉ gửi nhóm giá của dịch vụ xe
     * đang đăng — giá của dịch vụ khác bị server từ chối (validation chéo).
     */
    const money = (v: number | null | undefined): string | null =>
      v != null ? String(Math.round(v)) : null;

    const body: SaveVehiclePricingInput = {
      /*
       * `source` chỉ nói về CHÍNH SÁCH. Đặt giá riêng KHÔNG kéo theo ghi đè chính sách — gửi
       * `vehicle` khi không sửa chính sách sẽ đóng băng một bản sao mà người dùng không yêu cầu,
       * và xe im lặng ngừng nhận cập nhật của gian hàng.
       */
      source: editMode ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
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
      ...(editMode ? { policy: formToSaveInput(values) } : {}),
    };

    const changed = (next: string | null | undefined, prev: string | null | undefined): boolean =>
      next !== undefined && (next ?? null) !== (prev ?? null);
    const priceChanged =
      changed(body.weekdayPrice, pricing.weekdayPrice) ||
      changed(body.weekendPrice ?? null, pricing.weekendPrice) ||
      changed(body.hourlyPrice, pricing.hourlyPrice) ||
      (body.discountPercent !== undefined &&
        (body.discountPercent ?? null) !== (pricing.discountPercent ?? null)) ||
      changed(body.monthlyPrice, pricing.monthlyPrice) ||
      changed(body.withDriverDailyPrice, pricing.withDriverDailyPrice) ||
      changed(body.withDriverInterCityPrice, pricing.withDriverInterCityPrice) ||
      changed(body.withDriverOneWayPrice, pricing.withDriverOneWayPrice);

    if (pricing.isPublic && priceChanged) {
      setPending({ kind: 'public', body });
      return;
    }
    setPending({ kind: editMode ? 'override' : 'inherit', body });
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
              commit({ source: POLICY_SOURCE.SHOP }, true);
            },
          }
        : {
            title: confirmTitle(t, pending.kind),
            message: confirmBody(t, pending.kind, label),
            confirmLabel: pending.kind === 'public' ? t('confirm.publicOk') : t('confirm.ok'),
            cancelLabel: tActions('cancel'),
            destructive: false,
            onConfirm: () => commit(pending.body),
          };

  return (
    <>
      <AppHeader title={t('title')} subtitle={label} onBack={() => leave.guard(onBack)} />
      <VehicleEditTabs
        vehicleId={vehicleId}
        active={VEHICLE_EDIT_TAB.PRICING}
        guard={leave.guard}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        {...refresh}
        footer={
          canEdit ? (
            <Button
              label={t('confirm.ok')}
              loading={save.isPending}
              disabled={!formState.isDirty}
              onPress={() => void submit()}
            />
          ) : undefined
        }
      >
        <YStack gap={layout.section}>
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

              {/*
                Link CHỈ hiện khi đang kế thừa — đúng như web đặt nó trong nhánh `inheritBanner`.

                Đang tuỳ chỉnh riêng thì chính sách gian hàng không còn chi phối xe này, và một
                đường dẫn sang đó chỉ khiến người dùng tưởng sửa bên kia là xe này đổi theo.

                App chưa có màn chính sách gian hàng nên trả lời bằng một câu, không dựng nút
                chết im lặng.
              */}
              {editMode ? null : (
                <BlockLink
                  label={t('source.viewShopPolicy')}
                  onPress={() => toast.showInfo(tStates('featureComingSoon'))}
                />
              )}
            </YStack>
          </Card>

          {formState.isDirty ? (
            <YStack bg={colors.warningSurface} br={radius.sm} p={space.sm}>
              <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('dirty')}
              </Text>
            </YStack>
          ) : null}

          {hasSelfDrive ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('selfDrive.title')}</BlockTitle>
                <MoneyField
                  control={control}
                  name="weekdayPrice"
                  label={t('selfDrive.weekday')}
                  hint={t('selfDrive.weekdayHint')}
                  required
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="weekendPrice"
                  label={t('selfDrive.weekend')}
                  hint={t('selfDrive.weekendHint')}
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="hourlyPrice"
                  label={t('selfDrive.hourly')}
                  hint={t('selfDrive.hourlyHint')}
                  editable={canEdit}
                />
                <DirectDiscount control={control} setValue={setValue} canEdit={canEdit} />
              </YStack>
            </Card>
          ) : null}

          {hasLongTerm ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('longTerm.title')}</BlockTitle>
                <MoneyField
                  control={control}
                  name="monthlyPrice"
                  label={t('longTerm.monthly')}
                  hint={t('longTerm.monthlyHint', {
                    packages: LONG_TERM_PACKAGE_MONTHS.join(', '),
                  })}
                  editable={canEdit}
                />

                {/*
                  Công cụ ĐỊNH GIÁ — khối web có mà app thiếu hẳn.

                  Không có nó, chủ xe gõ một con số vào ô "giá tháng" mà không biết nó đắt hay rẻ
                  so với thuê ngày, và không biết khách sẽ trả bao nhiêu cho gói 6 hay 12 tháng.
                  Đây là màn ĐẶT GIÁ; thiếu bảng quy đổi thì nó chỉ là một ô nhập số.
                */}
                <LongTermPriceHint
                  weekdayPrice={watchedWeekday}
                  monthlyPrice={watchedMonthly}
                  discountTiers={watchedTiers}
                  discountEnabled={watchedDiscountEnabled}
                />
              </YStack>
            </Card>
          ) : null}

          {hasWithDriver ? (
            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('withDriver.title')}</BlockTitle>
                <MoneyField
                  control={control}
                  name="withDriverDailyPrice"
                  label={t('withDriver.daily')}
                  hint={t('withDriver.dailyHint')}
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="withDriverInterCityPrice"
                  label={t('withDriver.interCity')}
                  hint={t('withDriver.interCityHint')}
                  editable={canEdit}
                />
                <MoneyField
                  control={control}
                  name="withDriverOneWayPrice"
                  label={t('withDriver.oneWay')}
                  hint={t('withDriver.oneWayHint')}
                  editable={canEdit}
                />
              </YStack>
            </Card>
          ) : null}

          {editMode ? (
            /*
             * Form giá xe là SUPERSET của `PolicyFormValues` — cấu trúc tương thích, nhưng TS
             * không thu hẹp generic của RHF nên cần một cast tường minh tại biên.
             */
            <PolicySections
              control={control as unknown as Parameters<typeof PolicySections>[0]['control']}
              disabled={!canEdit || save.isPending}
            />
          ) : (
            <InheritedPolicyCard
              policy={pricing.shopPolicy ? policyToForm(pricing.shopPolicy) : null}
              canEdit={canEdit}
              onEdit={() => setEditingOverride(true)}
            />
          )}
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
    </>
  );
}

type PricingTranslator = ReturnType<typeof useTranslations<'Vehicles.pricing'>>;

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function confirmTitle(t: PricingTranslator, kind: 'public' | 'override' | 'inherit'): string {
  if (kind === 'public') return t('confirm.publicTitle');
  if (kind === 'override') return t('confirm.overrideTitle');
  return t('confirm.inheritTitle');
}

function confirmBody(
  t: PricingTranslator,
  kind: 'public' | 'override' | 'inherit',
  vehicle: string,
): string {
  if (kind === 'public') return t('confirm.publicBody', { vehicle });
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
                <Text col={colors.textMuted} fos={fontSize.bodySm} textDecorationLine="line-through">
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
}: {
  policy: PolicyFormValues | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
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
            <DataRow labelWide label={t('collateral')} value={collateral() ?? ''} />
            <DataRow
              labelWide
              label={t('delivery')}
              value={
                policy.deliveryEnabled
                  ? t('deliveryOn', { count: (policy.deliveryTiers ?? []).length })
                  : t('deliveryOff')
              }
            />
            <DataRow
              labelWide
              label={t('overtime')}
              value={
                policy.overtimeFeePerHour
                  ? t('overtimeValue', { fee: fmt.money(String(policy.overtimeFeePerHour)) })
                  : t('overtimeMissing')
              }
            />
            <DataRow
              labelWide
              label={t('discount')}
              value={maxDiscount == null ? t('discountOff') : t('discountMax', { percent: maxDiscount })}
            />
          </YStack>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>{t('emptyBody')}</Text>
        )}

        {canEdit ? <Button label={t('edit')} variant="secondary" onPress={onEdit} /> : null}
      </YStack>
    </Card>
  );
}
