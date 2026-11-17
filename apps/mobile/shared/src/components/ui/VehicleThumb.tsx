import { memo } from 'react';
import { YStack } from 'tamagui';
import { Ionicons } from '@/components/icons/Ionicons';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Ảnh xe nhỏ 85×54 bo 12 của thẻ tóm tắt trong tấm duyệt / từ chối (Figma "Vehicle Image"
 * `24145:96565`, `24145:97098`). Không ảnh thì biểu tượng xe trên nền xám nhạt.
 */
export const VehicleThumb = memo(function VehicleThumb({
  uri,
  recyclingKey,
  accessibilityLabel,
  size = 'md',
}: {
  /** `md` 85×54 bo 12 (thẻ tóm tắt tấm duyệt) · `sm` 63×40 bo 8 (thẻ xe Danh sách xe - Figma "Vehicle Image"). */
  size?: 'sm' | 'md';
  uri?: string | null;
  recyclingKey?: string;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const box = SIZE[size];
  return (
    <YStack w={box.width} h={box.height} br={box.radius} ov="hidden" bg={colors.surfaceMuted} flexShrink={0}>
      <RemoteImage
        uri={uri ?? null}
        radius={box.radius}
        {...(recyclingKey === undefined ? {} : { recyclingKey })}
        {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
        fallback={<Ionicons name="car-outline" size={space.lg} color={colors.placeholder} />}
      />
    </YStack>
  );
});

const SIZE = {
  md: { width: 85, height: 54, radius: radius.control },
  sm: { width: 63, height: 40, radius: radius.thumb },
} as const;
