import { memo, useCallback } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { applyDiscountPercent, isNewListing } from '@xeprime/domain';
import {
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  transmissionFamily,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { CardSpecIcon, type CardSpecIconKind } from '@/components/icons/CardSpecIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import {
  PhotoAmenityPills,
  listingAmenityItems,
} from '@/features/marketplace/components/PhotoAmenityPills';
import { NewVehicleBadge } from '@/features/marketplace/components/NewVehicleBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import type { VehicleBookingPickerItem } from '@/api/vehicles/api';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space } from '@/theme/tokens';

/** Trạng thái vận hành đáng báo trên thẻ — "sẵn sàng"/"đang thuê" đã do cờ bận theo khung giờ nói. */
const FLAGGED_STATUSES: readonly string[] = [
  VEHICLE_OPERATION_STATUS.MAINTENANCE,
  VEHICLE_OPERATION_STATUS.INACTIVE,
];

/** Ảnh 2:1 — thấp hơn thẻ chợ (16:9) để một màn điện thoại thấy được hơn một xe. */
const PHOTO_RATIO = 2;

/**
 * Thẻ xe của bước "Chọn xe" khi lập đơn — native port of web `StaffVehicleCard` (Figma Partner
 * `24565:59749`). Cùng thông tin với web: ảnh + % ưu đãi + "Đã có lịch" + nhãn tiện ích trên ảnh,
 * tên + đánh giá/"Xe mới", phường - tỉnh, thông số, biển số (hoặc mã xe) + trạng thái bảo dưỡng/ngừng,
 * giá/ngày (giá gốc gạch ngang khi có ưu đãi).
 *
 * Cả thẻ là MỘT nút chọn; xe đã có lịch trong khung giờ vẫn hiện nhưng mờ và không chạm được.
 */
export const StaffVehicleCard = memo(function StaffVehicleCard({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: VehicleBookingPickerItem;
  selected: boolean;
  onSelect: (vehicle: VehicleBookingPickerItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Listings.card');
  const tPicker = useTranslations('BookingRequests.vehiclePicker');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const { fuelTypeLabel } = useCatalogLabels();

  const discount = vehicle.discountPercent ?? 0;
  const hasRating = !isNewListing(vehicle);
  const fuel = fuelTypeLabel(vehicle.fuelType);
  const location = vehicle.provinceName
    ? vehicle.wardName
      ? t('locationLine', { ward: vehicle.wardName, province: vehicle.provinceName })
      : vehicle.provinceName
    : null;
  const amenities = listingAmenityItems(
    vehicle,
    vehicle.instantBookServiceTypes.length > 0,
    (key) => t(key),
  );
  const specs: { key: CardSpecIconKind; label: string }[] = [
    vehicle.seatCount ? { key: 'seats' as const, label: t('seats', { count: vehicle.seatCount }) } : null,
    vehicle.transmission
      ? {
          key: 'transmission' as const,
          label: t(`transmissionFamily.${transmissionFamily(vehicle.transmission)}`),
        }
      : null,
    fuel ? { key: 'fuel' as const, label: fuel } : null,
  ].filter((spec): spec is NonNullable<typeof spec> => spec !== null);
  const dailyPrice =
    vehicle.weekdayPrice && discount > 0
      ? applyDiscountPercent(vehicle.weekdayPrice, discount)
      : vehicle.weekdayPrice;
  const compactPrice = (value: string) => fmt.moneyCompact(value, { price: true });
  const flagged = FLAGGED_STATUSES.includes(vehicle.operationStatus);
  const statusMeta = flagged
    ? VEHICLE_OPERATION_STATUS_META[vehicle.operationStatus as VehicleOperationStatus]
    : undefined;

  const press = useCallback(() => onSelect(vehicle), [onSelect, vehicle]);

  return (
    <Pressable
      onPress={press}
      disabled={vehicle.busy}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: vehicle.busy }}
      accessibilityHint={vehicle.busy ? tPicker('busyHint', { name: vehicle.name }) : undefined}
      style={({ pressed }) => (pressed ? { opacity: 0.8 } : null)}
    >
      <YStack
        br={radius.card}
        bw={selected ? 2 : 1}
        bc={selected ? colors.primary : colors.border}
        bg={colors.surface}
        ov="hidden"
        opacity={vehicle.busy ? 0.5 : 1}
      >
        <YStack w="100%" aspectRatio={PHOTO_RATIO} bg={colors.surfaceMuted}>
          <RemoteImage
            uri={vehicle.mainImageUrl ?? null}
            recyclingKey={vehicle.id}
            fallback={<Ionicons name="car-outline" size={space.xl} color={colors.placeholder} />}
          />
          {discount > 0 ? (
            <XStack pos="absolute" top={space.sm} left={space.sm}>
              <DiscountTag percent={discount} size="sm" />
            </XStack>
          ) : null}
          {vehicle.busy ? (
            <XStack pos="absolute" top={space.sm} right={space.sm}>
              <Pill size="sm" tone="neutral" label={tPicker('busy')} />
            </XStack>
          ) : selected ? (
            <XStack pos="absolute" top={space.sm} right={space.sm}>
              <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primary} />
            </XStack>
          ) : null}
          <PhotoAmenityPills items={amenities} />
        </YStack>

        <YStack p={space.sm} gap={6}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack f={1} minWidth={0} ai="center" gap={6}>
              <Text
                flexShrink={1}
                col={colors.text}
                fos={fontSize.bodyLg}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {vehicle.name}
              </Text>
              {hasRating ? null : <NewVehicleBadge />}
            </XStack>
            {hasRating ? (
              <XStack flexShrink={0} ai="center" gap={space.xs}>
                <Ionicons name="star" size={iconSize.sm} color={market.star} />
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {t.rich('ratingValue', {
                    rating: fmt.rating(Number(vehicle.ratingAvg)),
                    count: vehicle.ratingCount,
                    muted: (chunks) => <Text col={colors.placeholder}>{chunks}</Text>,
                  })}
                </Text>
              </XStack>
            ) : null}
          </XStack>

          {location ? (
            <XStack ai="center" gap={space.xs}>
              <CardSpecIcon kind="location" size={16} color={colors.placeholder} />
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                {location}
              </Text>
            </XStack>
          ) : null}

          {specs.length > 0 ? (
            <XStack ai="center" gap={space.md} flexWrap="wrap">
              {specs.map((spec) => (
                <XStack key={spec.key} ai="center" gap={space.xs}>
                  <CardSpecIcon kind={spec.key} size={14} color={colors.placeholder} />
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {spec.label}
                  </Text>
                </XStack>
              ))}
            </XStack>
          ) : null}

          <XStack ai="flex-end" jc="space-between" gap={space.sm} pt={space.xs}>
            {/* Biển số là thứ nhân viên nhận ra xe; xe chưa có biển thì hiện mã xe. */}
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.placeholder} fos={fontSize.label}>
                {tPicker(vehicle.plateNumber ? 'plateLabel' : 'codeLabel')}
              </Text>
              <XStack ai="center" gap={space.xs} flexWrap="wrap">
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
                  {vehicle.plateNumber || vehicle.code}
                </Text>
                {flagged && statusMeta ? (
                  <Pill
                    size="sm"
                    shape="tag"
                    tone={pillToneOfStatusColor(statusMeta.color)}
                    label={dl('vehicleOperationStatus', vehicle.operationStatus)}
                  />
                ) : null}
              </XStack>
            </YStack>
            {dailyPrice ? (
              <YStack ai="flex-end" flexShrink={0}>
                {discount > 0 && vehicle.weekdayPrice ? (
                  <Text col={colors.placeholder} fos={fontSize.label} textDecorationLine="line-through">
                    {compactPrice(vehicle.weekdayPrice)}
                  </Text>
                ) : null}
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t.rich('priceDaily', {
                    value: compactPrice(dailyPrice),
                    amount: (chunks) => (
                      <Text col={colors.price} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                        {chunks}
                      </Text>
                    ),
                    unit: (chunks) => <Text>{chunks}</Text>,
                  })}
                </Text>
              </YStack>
            ) : null}
          </XStack>
        </YStack>
      </YStack>
    </Pressable>
  );
});
