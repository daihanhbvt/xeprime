import { memo, useCallback } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { applyDiscountPercent } from '@xeprime/domain';
import {
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import type { VehicleBookingPickerItem } from '@/api/vehicles/api';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, space } from '@/theme/tokens';
import { LineIcon } from '@/components/icons/LineIcon';

/** Trạng thái vận hành đáng báo trên thẻ — "sẵn sàng"/"đang thuê" đã do cờ bận theo khung giờ nói. */
const FLAGGED_STATUSES: readonly string[] = [
  VEHICLE_OPERATION_STATUS.MAINTENANCE,
  VEHICLE_OPERATION_STATUS.INACTIVE,
];

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

  const discount = vehicle.discountPercent ?? 0;
  const location = vehicle.provinceName
    ? vehicle.wardName
      ? t('locationLine', { ward: vehicle.wardName, province: vehicle.provinceName })
      : vehicle.provinceName
    : null;
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

  /*
   * Figma "Vehicle Card New" `24599:135744` (người dùng 28/11/2026): khung bo 16, đệm 12, hai hàng
   * cách 8. Hàng 1: ảnh 79×50 bo 8 + tên 16/24 đậm + viên "Giảm x%" + vị trí 14/22. Hàng 2: "Biển số
   * xe" 12 mờ / biển 14 vừa; giá gốc gạch 12 + giá 18/28 vàng "/ngày". Đang chọn: viền vàng, nền ngà.
   * Xe đã có lịch trong khung giờ: mờ + dòng "Đã có lịch", không chạm được (như web).
   */
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
        br={16}
        bw={1}
        bc={selected ? colors.primary : colors.border}
        bg={selected ? colors.brandWash : colors.surface}
        p={12}
        gap={8}
        ov="hidden"
        opacity={vehicle.busy ? 0.5 : 1}
      >
        <XStack ai="center" gap={8}>
          <YStack w={79} h={50} br={8} ov="hidden" bg={colors.surfaceMuted}>
            <RemoteImage
              uri={vehicle.mainImageUrl ?? null}
              recyclingKey={vehicle.id}
              fallback={<Ionicons name="car-outline" size={iconSize.lg} color={colors.placeholder} />}
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={4} jc="center">
            <XStack ai="center" gap={6} minWidth={0}>
              <Text flexShrink={1} col={colors.text} fos={16} lh={24} fow={fontWeight.semibold} numberOfLines={1}>
                {vehicle.name}
              </Text>
              {discount > 0 ? (
                <XStack px={6} py={4} br={999} bg={colors.successSurface} flexShrink={0}>
                  <Text col={colors.success} fos={10} lh={14} fow={fontWeight.semibold}>
                    {tPicker('discountBadge', { percent: discount })}
                  </Text>
                </XStack>
              ) : null}
            </XStack>
            {location ? (
              <XStack ai="center" gap={8}>
                <LineIcon name="location" size={20} color={colors.placeholder} />
                <Text f={1} col={colors.textMuted} fos={14} lh={22} numberOfLines={1}>
                  {location}
                </Text>
              </XStack>
            ) : null}
          </YStack>
        </XStack>

        <XStack ai="flex-end" jc="space-between" gap={space.sm}>
          {/* Biển số là thứ nhân viên nhận ra xe; xe chưa có biển thì hiện mã xe. */}
          <YStack f={1} minWidth={0}>
            <Text col={colors.placeholder} fos={12} lh={18}>
              {vehicle.busy ? tPicker('busy') : tPicker(vehicle.plateNumber ? 'plateLabel' : 'codeLabel')}
            </Text>
            <XStack ai="center" gap={space.xs} flexWrap="wrap">
              <Text col={colors.text} fos={14} lh={22} fow={fontWeight.medium} numberOfLines={1}>
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
                <Text col={colors.borderInput} fos={12} lh={18} textDecorationLine="line-through" mb={-6}>
                  {compactPrice(vehicle.weekdayPrice)}
                </Text>
              ) : null}
              <Text col={colors.placeholder} fos={14} lh={28}>
                {t.rich('priceDaily', {
                  value: compactPrice(dailyPrice),
                  amount: (chunks) => (
                    <Text col={colors.primary} fos={18} lh={28} fow={fontWeight.semibold}>
                      {chunks}
                    </Text>
                  ),
                  unit: (chunks) => <Text col={colors.placeholder} fos={14}>{chunks}</Text>,
                })}
              </Text>
            </YStack>
          ) : null}
        </XStack>
      </YStack>
    </Pressable>
  );
});

/**
 * Khung chờ cùng hình {@link StaffVehicleCard}: ảnh 79×50 + tên + vị trí, rồi hàng biển số ↔ giá.
 * Cùng đệm/khe/bo góc với thẻ thật để danh sách không nhảy khi dữ liệu về.
 */
export function StaffVehicleCardSkeleton() {
  const colors = useColors();
  return (
    <YStack br={16} bw={1} bc={colors.border} bg={colors.surface} p={12} gap={8}>
      <XStack ai="center" gap={8}>
        <Skeleton width={79} height={50} />
        <YStack f={1} minWidth={0} gap={4} jc="center">
          <Skeleton width="65%" height={20} />
          <Skeleton width="80%" height={16} />
        </YStack>
      </XStack>
      <XStack ai="flex-end" jc="space-between" gap={space.sm}>
        <YStack f={1} gap={4}>
          <Skeleton width={60} height={12} />
          <Skeleton width="45%" height={18} />
        </YStack>
        <Skeleton width={96} height={24} />
      </XStack>
    </YStack>
  );
}
