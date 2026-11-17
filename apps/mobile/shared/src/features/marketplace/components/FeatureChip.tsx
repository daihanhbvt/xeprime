import { VehicleFeatureIcon } from '@/components/icons/VehicleFeatureIcon';
import { Text, XStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/*
 * Icon tiện ích dùng CÙNG bộ SVG nét với web `VehicleFeatureIcon` (Figma v2) — xem
 * `components/icons/VehicleFeatureIcon`. Khoá lạ rơi về dấu tích tròn, không bao giờ để trống.
 */

/**
 * Một ô của lưới "Tiện ích trên xe" ở trang chi tiết — `.featureItem` web ≤640px (Figma
 * `19771:72667`): icon mảnh 18 + chữ 13 `text-secondary`, không nền (hạ từ 16 — người dùng chốt
 * 27–28/10/2026: chữ trang chi tiết to hơn web). Nơi gọi xếp lưới 2 cột.
 */
export function FeatureItem({ featureKey, label }: { featureKey: string; label: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={space.sm} minWidth={0}>
      <VehicleFeatureIcon featureKey={featureKey} size={18} color={colors.textMuted} />
      <Text f={1} col={colors.textMuted} fos={13} numberOfLines={1}>
        {label}
      </Text>
    </XStack>
  );
}

/**
 * Một tiện ích của xe: biểu tượng mảnh + nhãn, nền màu thương hiệu ĐẬM. Chữ dùng `onPrimary`
 * (đen) chứ không phải trắng — gold sáng không đỡ nổi chữ trắng.
 */
export function FeatureChip({ featureKey, label }: { featureKey: string; label: string }) {
  const colors = useColors();

  return (
    <XStack
      ai="center"
      gap={space.xs}
      bg={colors.primary}
      br={radius.pill}
      px={space.sm}
      py={space.xs}
    >
      <VehicleFeatureIcon featureKey={featureKey} size={13} color={colors.onPrimary} />
      <Text col={colors.onPrimary} fos={fontSize.label} fow={fontWeight.medium}>
        {label}
      </Text>
    </XStack>
  );
}
