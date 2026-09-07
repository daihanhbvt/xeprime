import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { Control } from 'react-hook-form';
import { VEHICLE_TYPE } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useShopPolicy } from '../hooks/use-vehicle';
import { PricingStep } from './VehicleFormSteps';
import type { RentalPolicyValues } from '../api';

/**
 * Bước 2 của luồng tạo xe — bản native của `CreateVehiclePricingStep`.
 *
 * HAI thẻ, đúng thứ tự web: chính sách chung của gian hàng mà xe sẽ kế thừa, rồi mới tới giá
 * thuê riêng của xe. Thứ tự đó là một câu chuyện: "đây là thứ bạn nhận sẵn — giờ điền phần chỉ
 * riêng xe này mới có". Đảo lại thì người dùng gõ giá xong mới biết mình vừa kế thừa cái gì.
 */
export function CreateVehiclePricingStep({
  control,
  isCar,
}: {
  control: Control<VehicleFormValues>;
  isCar: boolean;
}) {
  const t = useTranslations('Vehicles.form.pricingStep');
  const tStates = useTranslations('Common.states');
  const toast = useAppToast();

  // Chính sách kế thừa theo ĐÚNG loại xe đang tạo — ô tô/xe máy hai bộ riêng.
  const policy = useShopPolicy(isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE);
  const values = policy.data?.policy ?? null;

  /* Màn "Chính sách gian hàng" chưa có bản native — báo đang phát triển thay vì một link chết. */
  const openShopPolicies = () => toast.showInfo(tStates('featureComingSoon'));

  return (
    <YStack gap={layout.section}>
      <Card>
        <YStack gap={space.sm}>
          <BlockTitle>{t('shopPolicyTitle')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('shopPolicyBody')}
          </Text>

          {policy.isPending ? (
            <SkeletonText lines={3} />
          ) : values ? (
            <PolicyPreview values={values} onOpenPolicies={openShopPolicies} />
          ) : (
            <Callout tone="warning" title={t('noPolicyTitle')}>
              {/* Web để đây là một <Link> sang màn chính sách gian hàng. */}
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
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <BlockTitle>{t('vehiclePriceTitle')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('vehiclePriceBody')}
          </Text>
          <PricingStep control={control} isCar={isCar} />
        </YStack>
      </Card>
    </YStack>
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
