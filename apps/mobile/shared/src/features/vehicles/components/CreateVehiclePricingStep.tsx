import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { ReactNode } from 'react';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE,
  isVehicleServiceTypeAllowed,
  type ServiceType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { Callout } from '@/components/ui/Callout';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import { discountedPriceVnd } from '../pricing';
import type { RentalPolicyValues } from '../api';
import { PAIR_GAP } from './field-layout';
import {
  LongTermPriceFields,
  Notice,
  useCatalogPriceHint,
} from './VehicleFormSteps';

/** Figma "Icon" của thẻ dịch vụ: đệm 8 quanh icon 24, bo 12, nền `bg/primary-low`. */
const SERVICE_ICON: Record<ServiceType, LineIconName> = {
  [SERVICE_TYPE.SELF_DRIVE]: 'password-1',
  [SERVICE_TYPE.WITH_DRIVER]: 'profile-octagon',
  [SERVICE_TYPE.LONG_TERM]: 'calendar',
};
const SERVICE_ICON_SIZE = 24;

/**
 * Bước 2 "Dịch vụ & giá" của wizard tạo xe - Figma Thêm xe MB (`24486:109882`).
 *
 * Băng "Kế thừa chính sách gian hàng" (cọc · phí quá giờ · giao xe + ưu đãi dài hạn) ở đầu, rồi BA
 * THẺ dịch vụ có công tắc: bật thẻ = thêm dịch vụ vào `serviceTypes` và mở ô giá của nó (hai cột).
 * Cuối là "Giao xe tận nơi" (web có, Figma chưa vẽ - giữ) và "Tự động đồng ý nhận chuyến".
 *
 * Luật cũ giữ nguyên: dịch vụ không hợp loại xe bị khoá, tắt dịch vụ đã nhập giá thì cảnh báo giá bị
 * xoá; gợi ý giá theo Dữ liệu xe và "Giá hiển thị trên sàn" như web.
 */
export function CreateVehiclePricingStep({
  control,
  isCar,
  setValue,
  autoAccept,
  shopPolicy = true,
}: {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  setValue: UseFormSetValue<VehicleFormValues>;
  /** "Tự động đồng ý nhận chuyến" - thiết lập của dịch vụ tự lái, ghi SAU khi tạo xe. */
  autoAccept: { value: boolean; onChange: (next: boolean) => void };
  /**
   * Băng chính sách GIAN HÀNG + ghi chú "theo chính sách gian hàng" - tắt ở tuyến hoa hồng: họ không
   * có trang đó, chính sách đặt trên từng xe ở màn sửa xe (web `shopPolicy`, ADR 0085 điều 3).
   */
  shopPolicy?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.pricingStep');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const tPolicies = useTranslations('Vehicles.form.policies');
  const navigateOnce = useNavigateOnce();
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;

  // Chính sách kế thừa theo ĐÚNG loại xe đang tạo - ô tô/xe máy hai bộ riêng.
  const policy = useShopPolicy(vehicleType, shopPolicy);
  const values = policy.data?.policy ?? null;
  const openShopPolicies = () => navigateOnce(ROUTES.manage.shopPolicies());
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const selfDrive = serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);

  const bodies: Record<ServiceType, ReactNode> = {
    [SERVICE_TYPE.SELF_DRIVE]: <SelfDriveGrid control={control} setValue={setValue} />,
    [SERVICE_TYPE.WITH_DRIVER]: <WithDriverGrid control={control} setValue={setValue} />,
    // Bỏ dòng "Ưu đãi theo thời hạn lấy từ chính sách gian hàng" (người dùng chốt 28/11/2026).
    [SERVICE_TYPE.LONG_TERM]: <LongTermPriceFields control={control} setValue={setValue} />,
  };

  return (
    <YStack gap={space.lg}>
      {!shopPolicy ? null : policy.isPending ? (
        <YStack bg={colors.surface} br={radius.control} p={space.md}>
          <SkeletonText lines={3} />
        </YStack>
      ) : values ? (
        <PolicyBanner values={values} onOpenPolicies={openShopPolicies} />
      ) : (
        <Callout tone="warning" title={t('noPolicyTitle')}>
          <Text
            col={colors.primaryActive}
            fos={typeScale.body.fontSize}
            fow={fontWeight.medium}
            onPress={openShopPolicies}
          >
            {t('noPolicyAction')}
          </Text>
        </Callout>
      )}

      <Controller
        control={control}
        name="serviceTypes"
        render={({ field, fieldState }) => {
          const current = field.value ?? [];
          return (
            <YStack gap={space.lg}>
              {fieldState.error?.message ? (
                <Callout tone="danger">{fieldState.error.message}</Callout>
              ) : null}
              {(Object.keys(SERVICE_ICON) as ServiceType[]).map((service) => {
                const checked = current.includes(service);
                // Cùng luật chip cũ: chỉ khoá việc BẬT một dịch vụ không hợp loại xe.
                const locked = !checked && !isVehicleServiceTypeAllowed(vehicleType, service);
                return (
                  <YStack
                    key={service}
                    gap={space.md}
                    p={space.lg}
                    br={radius.card}
                    bw={1}
                    bc={colors.border}
                    bg={colors.surface}
                  >
                    <XStack ai="center" gap={space.sm}>
                      <YStack p={space.sm} br={radius.control} bg={colors.brandLow}>
                        <LineIcon
                          name={SERVICE_ICON[service]}
                          size={SERVICE_ICON_SIZE}
                          color={colors.brandShape}
                        />
                      </YStack>
                      <YStack f={1} minWidth={0}>
                        <SwitchRow
                          title={tCreate(`services.${service}.title` as 'services.self_drive.title')}
                          description={
                            locked
                              ? t('services.notForVehicleType')
                              : tCreate(
                                  `services.${service}.description` as 'services.self_drive.description',
                                )
                          }
                          value={checked}
                          disabled={locked}
                          onChange={() =>
                            field.onChange(
                              checked
                                ? current.filter((s) => s !== service)
                                : [...new Set([...current, service])],
                            )
                          }
                        />
                      </YStack>
                    </XStack>
                    {checked ? bodies[service] : null}
                  </YStack>
                );
              })}
            </YStack>
          );
        }}
      />

      {/* Giao xe tận nơi: Figma không vẽ ở bước tạo, web có - giữ (người dùng chốt 27/11/2026). */}
      <Controller
        control={control}
        name="deliveryEnabled"
        render={({ field }) => (
          <SwitchRow
            title={tPolicies('delivery')}
            description={tPolicies('deliveryDescription')}
            value={field.value === true}
            onChange={() => field.onChange(!field.value)}
          />
        )}
      />
      <SwitchRow
        title={t('autoAccept.title')}
        description={selfDrive ? t('autoAccept.description') : t('autoAccept.needsSelfDrive')}
        value={selfDrive && autoAccept.value}
        disabled={!selfDrive}
        onChange={() => autoAccept.onChange(!autoAccept.value)}
      />
    </YStack>
  );
}

interface GridProps {
  control: Control<VehicleFormValues>;
  setValue: UseFormSetValue<VehicleFormValues>;
}

/** Hai ô cùng một hàng (Figma "Vehicle Details Row": hai ô 156 cách 12). */
function Pair({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <XStack gap={PAIR_GAP} ai="flex-start">
      <YStack f={1} minWidth={0}>
        {left}
      </YStack>
      <YStack f={1} minWidth={0}>
        {right}
      </YStack>
    </XStack>
  );
}

/** Giá TỰ LÁI: "Ngày thường | Cuối tuần", "Theo giờ | Giảm giá" (Figma), gợi ý thành ⓘ cạnh nhãn. */
function SelfDriveGrid({ control }: GridProps) {
  const tPrices = useTranslations('Vehicles.form.prices');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const tWizard = useTranslations('Vehicles.form.wizard');
  const fmt = useAppFormat();
  const hint = useCatalogPriceHint({ control });
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const discounted = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  return (
    <YStack gap={space.md}>
      <Pair
        left={
          <YStack gap={space.xs}>
            <MoneyField
              control={control}
              name="weekdayPrice"
              label={tCreate('prices.weekday')}
              required
              placeholder={tPrices('weekdayPlaceholder')}
              hint={hint(tPrices('weekdayHelp'), 'weekdayPrice')}
              hintInLabel
            />
          </YStack>
        }
        right={
          <YStack gap={space.xs}>
            <MoneyField
              control={control}
              name="weekendPrice"
              label={tCreate('prices.weekend')}
              placeholder={tPrices('weekendPlaceholder')}
              hint={hint(tPrices('weekendHelp'), 'weekendPrice')}
              hintInLabel
            />
          </YStack>
        }
      />
      <Pair
        left={
          <YStack gap={space.xs}>
            <MoneyField
              control={control}
              name="hourlyPrice"
              label={tCreate('prices.hourly')}
              placeholder={tPrices('hourlyPlaceholder')}
              hint={hint(tPrices('hourlyHelp'), 'hourlyPrice')}
              hintInLabel
            />
          </YStack>
        }
        right={
          <NumberField
            control={control}
            name="discountPercent"
            percent
            label={tCreate('prices.discount')}
            placeholder={tPrices('discountPlaceholder')}
            hint={tPrices('discountHelp')}
            hintInLabel
          />
        }
      />
      {discounted != null ? (
        <Notice tone="info" title={tWizard('pricePreview', { price: fmt.money(discounted) })} />
      ) : null}
    </YStack>
  );
}

/** Giá CÓ TÀI XẾ: nội thành (cả hàng, bắt buộc lên chợ), rồi "Liên tỉnh | Liên tỉnh 1 chiều". */
function WithDriverGrid({ control }: GridProps) {
  const tPrices = useTranslations('Vehicles.form.prices');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const hint = useCatalogPriceHint({ control });
  return (
    <YStack gap={space.md}>
      <YStack gap={space.xs}>
        <MoneyField
          control={control}
          name="withDriverDailyPrice"
          label={tCreate('prices.withDriverDaily')}
          required
          placeholder={tPrices('withDriverDailyPlaceholder')}
          hint={hint(tPrices('withDriverDailyHelp'), 'withDriverDailyPrice')}
          hintInLabel
        />
      </YStack>
      <Pair
        left={
          <MoneyField
            control={control}
            name="withDriverInterCityPrice"
            label={tCreate('prices.withDriverInterCity')}
            placeholder={tPrices('withDriverInterCityPlaceholder')}
            hint={tPrices('withDriverInterCityHelp')}
            hintInLabel
          />
        }
        right={
          <MoneyField
            control={control}
            name="withDriverOneWayPrice"
            label={tCreate('prices.withDriverOneWay')}
            placeholder={tPrices('withDriverOneWayPlaceholder')}
            hint={tPrices('withDriverOneWayHelp')}
            hintInLabel
          />
        }
      />
    </YStack>
  );
}

/**
 * Băng "Kế thừa chính sách gian hàng" (Figma "Store Policy Banner" `24486:110409`): nền trắng, bo 12,
 * đệm 12; hàng đầu ⓘ + tiêu đề xanh 12 semibold + "Chi tiết →"; ba cột Cọc xe · Phí quá giờ · Giao xe
 * tận nơi (giao xe đang bật tô xanh); "Ưu đãi thuê dài hạn" với viên giảm giá xanh nhạt.
 *
 * Chỉ HIỂN THỊ: mọi giá trị hiệu lực do backend quyết lúc dựng báo giá (ADR 0008).
 */
function PolicyBanner({
  values,
  onOpenPolicies,
}: {
  values: RentalPolicyValues;
  onOpenPolicies: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.pricingStep');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();

  const delivery = values.deliveryEnabled
    ? values.deliveryMaxRadiusKm
      ? t('deliveryOnRadius', { km: values.deliveryMaxRadiusKm })
      : t('deliveryOn')
    : t('deliveryOff');
  const tiers = values.discountEnabled ? values.discountTiers : [];

  return (
    <YStack bg={colors.surface} br={radius.control} p={space.md} gap={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <XStack ai="center" gap={6} f={1} minWidth={0}>
          <LineIcon name="info-circle-16" color={colors.infoStrong} />
          <Text
            f={1}
            col={colors.infoStrong}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {tCreate('policyInherit')}
          </Text>
        </XStack>
        <Pressable onPress={onOpenPolicies} accessibilityRole="link" hitSlop={space.sm}>
          <Text
            col={colors.infoStrong}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.semibold}
          >
            {tCreate('policyDetail')}
          </Text>
        </Pressable>
      </XStack>

      <XStack
        jc="space-between"
        ai="flex-start"
        gap={space.sm}
        pb={space.md}
        borderBottomWidth={tiers.length > 0 ? 1 : 0}
        borderBottomColor={colors.border}
      >
        <PolicyColumn label={tCreate('deposit')} value={fmt.money(values.depositAmount)} />
        <PolicyColumn
          label={tCreate('overtime')}
          value={
            values.overtimeFeePerHour
              ? tUnits('perHour', { value: fmt.money(values.overtimeFeePerHour) })
              : t('notConfigured')
          }
        />
        <PolicyColumn
          label={tCreate('delivery')}
          value={delivery}
          {...(values.deliveryEnabled ? { tone: colors.success } : {})}
        />
      </XStack>

      {tiers.length > 0 ? (
        <YStack gap={space.sm}>
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {tCreate('discounts')}
          </Text>
          <XStack flexWrap="wrap" columnGap={space.md} rowGap={space.xs} ai="center">
            {tiers.map((tier) => (
              <XStack key={tier.minMonths} ai="center" gap={space.xs}>
                <Text
                  col={colors.text}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                >
                  {/* Nhãn "N tháng" đi qua `packageLabel` (ADR 0011) - không tự ghép chữ "tháng". */}
                  {t('packageChip', { label: fmt.packageLabel(tier.minMonths) ?? '' })}
                </Text>
                <YStack px={space.sm} py={2} br={radius.pill} bg={colors.successSurface}>
                  <Text
                    col={colors.success}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {tCreate('discountPercent', { percent: tier.percent })}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </XStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Một cột của băng chính sách: nhãn 12 thường, giá trị 12 medium, căn giữa. */
function PolicyColumn({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const colors = useColors();
  return (
    <YStack ai="center" gap={2} flexShrink={1}>
      <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
        {label}
      </Text>
      <Text
        col={tone ?? colors.text}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.medium}
        ta="center"
      >
        {value}
      </Text>
    </YStack>
  );
}
