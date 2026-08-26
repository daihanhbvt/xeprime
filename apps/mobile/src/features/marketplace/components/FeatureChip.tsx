import { Ionicons } from '@expo/vector-icons';
import { Text, XStack } from 'tamagui';
import type { VehicleFeatureKey } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Biểu tượng cho 14 tiện ích của `VEHICLE_FEATURE_LABEL`.
 *
 * Toàn bộ dùng bản `-outline`: bản đặc ở cỡ nhỏ bị bết thành một khối, đọc ra hình thù thì
 * chậm hơn đọc chữ bên cạnh — tức là biểu tượng phản tác dụng.
 *
 * Khoá lạ (admin thêm tiện ích mới) rơi về dấu tick, không bao giờ để trống.
 */
const FEATURE_ICON: Record<VehicleFeatureKey, IconName> = {
  bluetooth: 'bluetooth-outline',
  gps: 'navigate-outline',
  backup_camera: 'camera-outline',
  camera_360: 'scan-outline',
  dash_camera: 'videocam-outline',
  reverse_sensor: 'radio-outline',
  sunroof: 'sunny-outline',
  etc: 'card-outline',
  spare_tire: 'ellipse-outline',
  airbag: 'shield-checkmark-outline',
  usb: 'hardware-chip-outline',
  screen: 'tv-outline',
  map: 'map-outline',
  child_seat: 'happy-outline',
};

/**
 * Một tiện ích của xe: biểu tượng mảnh + nhãn, nền màu thương hiệu ĐẬM.
 *
 * Cùng nền với avatar và nút chính của app. Chữ dùng `onPrimary` (đen) chứ không phải trắng —
 * gold sáng không đỡ nổi chữ trắng.
 */
export function FeatureChip({ featureKey, label }: { featureKey: string; label: string }) {
  const icon = FEATURE_ICON[featureKey as VehicleFeatureKey] ?? 'checkmark-circle-outline';

  return (
    <XStack
      ai="center"
      gap={space.xs}
      bg={colors.primary}
      br={radius.pill}
      px={space.sm}
      py={space.xs}
    >
      <Ionicons name={icon} size={13} color={colors.onPrimary} />
      <Text col={colors.onPrimary} fos={fontSize.label} fow={fontWeight.medium}>
        {label}
      </Text>
    </XStack>
  );
}
