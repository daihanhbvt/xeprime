import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { ComponentProps, ReactNode } from 'react';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE,
  isVehicleServiceTypeAllowed,
  type ServiceType,
} from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { useDomainLabel } from '@/i18n/domain';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import type { VehicleFormValues } from '@xeprime/validators';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import {
  DeliveryToggle,
  LongTermPriceFields,
  SelfDrivePriceFields,
  ServicePriceRemovalWarning,
  WithDriverPriceFields,
} from './VehicleFormSteps';
import type { RentalPolicyValues } from '../api';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Bước 2 "Dịch vụ & giá" của wizard tạo xe — bản native của `CreateVehiclePricingStep` web (Figma
 * `24352:80745`, 17/11/2026).
 *
 * Khối chính sách kế thừa của gian hàng ở đầu, rồi BA THẺ dịch vụ có công tắc (thay chip "Loại dịch
 * vụ" cũ ở bước 1): bật thẻ = thêm dịch vụ vào `serviceTypes` và mở ô giá của nó. Luật cũ giữ nguyên:
 * dịch vụ không hợp loại xe bị khoá, tắt dịch vụ đã nhập giá thì cảnh báo giá bị xoá.
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
   * Khối chính sách GIAN HÀNG + ghi chú "theo chính sách gian hàng" - tắt ở tuyến hoa hồng: họ không
   * có trang đó, chính sách đặt trên từng xe ở màn sửa xe (web `shopPolicy`, ADR 0085 điều 3).
   */
  shopPolicy?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.pricingStep');
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const vehicleType = isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;

  // Chính sách kế thừa theo ĐÚNG loại xe đang tạo — ô tô/xe máy hai bộ riêng.
  const policy = useShopPolicy(vehicleType, shopPolicy);
  const values = policy.data?.policy ?? null;
  const openShopPolicies = () => navigateOnce(ROUTES.manage.shopPolicies());
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const selfDrive = serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);

  const services: ReadonlyArray<{ service: ServiceType; icon: IconName; body: ReactNode }> = [
    {
      service: SERVICE_TYPE.SELF_DRIVE,
      icon: 'key-outline',
      body: <SelfDrivePriceFields control={control} setValue={setValue} />,
    },
    {
      service: SERVICE_TYPE.WITH_DRIVER,
      icon: 'person-outline',
      body: <WithDriverPriceFields control={control} setValue={setValue} />,
    },
    {
      service: SERVICE_TYPE.LONG_TERM,
      icon: 'calendar-outline',
      body: (
        <YStack gap={space.sm}>
          <LongTermPriceFields control={control} setValue={setValue} />
          {shopPolicy ? (
          <Callout tone="info">
            <Text col={colors.info} fos={fontSize.bodySm}>
              {t('longTermInherit')}{' '}
              <Text col={colors.brandLink} fow={fontWeight.semibold} onPress={openShopPolicies}>
                {t('longTermInheritLink')}
              </Text>
            </Text>
          </Callout>
          ) : null}
        </YStack>
      ),
    },
  ];

  return (
    <Card>
      <YStack gap={space.md}>
        <YStack gap={2}>
          <SectionHeader icon="pricetag-outline">{t('title')}</SectionHeader>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('subtitle')}
          </Text>
        </YStack>

        {!shopPolicy ? null : policy.isPending ? (
          <SkeletonText lines={3} />
        ) : values ? (
          <PolicyPreview values={values} onOpenPolicies={openShopPolicies} />
        ) : (
          <Callout tone="warning" title={t('noPolicyTitle')}>
            <Text
              col={colors.primaryActive}
              fos={fontSize.bodySm}
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
              <YStack gap={space.sm}>
                {fieldState.error?.message ? (
                  <Callout tone="danger">{fieldState.error.message}</Callout>
                ) : null}
                {services.map(({ service, icon, body }) => {
                  const checked = current.includes(service);
                  // Cùng luật chip cũ: chỉ khoá việc BẬT một dịch vụ không hợp loại xe.
                  const locked = !checked && !isVehicleServiceTypeAllowed(vehicleType, service);
                  return (
                    <YStack
                      key={service}
                      gap={space.sm}
                      p={space.md}
                      br={radius.control}
                      bw={1}
                      bc={checked ? colors.primaryBorder : colors.borderSubtle}
                      bg={colors.surface}
                    >
                      <XStack ai="center" gap={space.sm}>
                        <YStack
                          w={36}
                          h={36}
                          br={radius.md}
                          ai="center"
                          jc="center"
                          bg={colors.primaryLight}
                        >
                          <Ionicons name={icon} size={iconSize.md} color={colors.primary} />
                        </YStack>
                        <YStack f={1}>
                          <ToggleRow
                            label={domainLabel('serviceType', service)}
                            hint={
                              locked
                                ? t('services.notForVehicleType')
                                : t(`services.${service}Description`)
                            }
                            checked={checked}
                            disabled={locked}
                            onToggle={() =>
                              field.onChange(
                                checked
                                  ? current.filter((s) => s !== service)
                                  : [...new Set([...current, service])],
                              )
                            }
                          />
                        </YStack>
                      </XStack>
                      {checked ? body : null}
                    </YStack>
                  );
                })}
              </YStack>
            );
          }}
        />

        <ServicePriceRemovalWarning control={control} />

        {/* Giao xe tận nơi: Figma không vẽ ở bước tạo, giữ lại theo quyết định 17/11/2026. */}
        <DeliveryToggle control={control} />
        <ToggleRow
          label={t('autoAccept.title')}
          hint={selfDrive ? t('autoAccept.description') : t('autoAccept.needsSelfDrive')}
          checked={selfDrive && autoAccept.value}
          disabled={!selfDrive}
          onToggle={() => autoAccept.onChange(!autoAccept.value)}
        />
      </YStack>
    </Card>
  );
}

/**
 * "Xem trước bảng giá áp dụng" — nhãn hoa nhỏ, giá trị đậm ngay dưới.
 *
 * Chỉ HIỂN THỊ: mọi giá trị hiệu lực do backend quyết lúc dựng báo giá (ADR 0008). Giao nhận
 * đang bật tô xanh vì đó là thứ duy nhất ở đây có trạng thái bật/tắt — ba dòng còn lại là số.
 */
function PolicyPreview({
  values,
  onOpenPolicies,
}: {
  values: RentalPolicyValues;
  onOpenPolicies: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.pricingStep');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();

  const delivery = values.deliveryEnabled
    ? values.deliveryMaxRadiusKm
      ? t('deliveryOnRadius', { km: values.deliveryMaxRadiusKm })
      : t('deliveryOn')
    : t('deliveryOff');

  return (
    <YStack gap={space.sm} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
      <YStack gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
          {t('previewTitle')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('previewSource')}{' '}
          <Text col={colors.primaryActive} fow={fontWeight.medium} onPress={onOpenPolicies}>
            {t('previewSourceLink')}
          </Text>
        </Text>
      </YStack>

      <PreviewItem label={t('deposit')} value={fmt.money(values.depositAmount)} />
      <PreviewItem
        label={t('delivery')}
        value={delivery}
        {...(values.deliveryEnabled ? { tone: colors.success } : {})}
      />
      <PreviewItem
        label={t('overtime')}
        value={
          values.overtimeFeePerHour
            ? tUnits('perHour', { value: fmt.money(values.overtimeFeePerHour) })
            : t('notConfigured')
        }
      />

      {values.discountEnabled && values.discountTiers.length > 0 ? (
        <YStack gap={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.label} textTransform="uppercase">
            {t('discountsLabel')}
          </Text>
          <XStack flexWrap="wrap" gap={space.xs}>
            {values.discountTiers.map((tier) => (
              <XStack key={tier.minMonths} ai="center" gap={space.xs}>
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {/* Nhãn "N tháng" đi qua `packageLabel` (ADR 0011) — không tự ghép chữ "tháng". */}
                  {t('packageChip', { label: fmt.packageLabel(tier.minMonths) ?? '' })}
                </Text>
                <DiscountTag percent={tier.percent} size="sm" />
              </XStack>
            ))}
          </XStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Một dòng của bảng xem trước: nhãn HOA nhỏ ở trên, giá trị đậm ở dưới. */
function PreviewItem({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const colors = useColors();
  return (
    <YStack gap={2}>
      <Text col={colors.textMuted} fos={fontSize.label} textTransform="uppercase">
        {label}
      </Text>
      <Text col={tone ?? colors.text} fos={fontSize.body} fow={fontWeight.bold}>
        {value}
      </Text>
    </YStack>
  );
}
