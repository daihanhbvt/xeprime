import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';

/**
 * Liên kết CHỮ + mũi tên phải của design v2 (Figma "Button" link, vd `24175:52445` "Xem tất cả
 * trong Đơn thuê xe →"): chữ 14/20 đậm vừa màu `text/brand/primary-2`, mũi tên "Right 1" 20 cùng
 * màu, cách 6. Không nền, không viền - nó là link, không phải nút.
 *
 * Vùng chạm nới bằng `hitSlop`, không bằng chiều cao: hàng tiêu đề "Nhóm thông tin" cao đúng 24.
 */
export const LinkArrow = memo(function LinkArrow({
  label,
  onPress,
  accessibilityLabel,
  icon = 'arrow-right',
}: {
  /** `chevron-right` - "Lịch xe ›" của thẻ xe chi tiết đơn (Figma `24145:101960`). */
  icon?: 'arrow-right' | 'chevron-right';
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => (pressed ? PRESSED : null)}
    >
      <XStack ai="center" gap={GAP}>
        <Text
          col={colors.brandLink}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {label}
        </Text>
        <LineIcon name={icon} color={colors.brandLink} size={ICON} />
      </XStack>
    </Pressable>
  );
});

/** Figma: `gap 6`, icon "Icon / Arrows" 20. */
const GAP = 6;
const ICON = 20;
const HIT_SLOP = { top: space.sm + space.xs, bottom: space.sm + space.xs, left: space.sm, right: space.sm };
const PRESSED = { opacity: 0.6 };
