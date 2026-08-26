import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

export type IconName = keyof typeof Ionicons.glyphMap;

interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: IconName;
  /** Nút hình tuỳ ý đứng trước nhãn — logo hãng xe chẳng hạn, thứ không có trong Ionicons. */
  leading?: ReactNode;
  onPress?: () => void;
  /** Chiếm đều bề ngang trong một hàng chia đều (segmented). */
  grow?: boolean;
  size?: 'sm' | 'md';
  /**
   * `segmented`: mục chưa chọn KHÔNG có nền và viền — cả hàng đọc như một dải liền, chỉ mục
   * đang chọn nổi lên. Dùng cho hai tầng loại xe / dịch vụ của thẻ tìm kiếm, giống web.
   *
   * `filled`: mục chưa chọn có nền chìm và viền — dùng khi các viên đứng rời nhau (lộ trình).
   */
  variant?: 'segmented' | 'filled';
}

/**
 * Viên chọn — dùng cho segmented (loại xe, dịch vụ), lọc nhanh và nhãn trạng thái.
 *
 * Cao tối thiểu `sizing.touchTarget` kể cả cỡ `sm`: cỡ chỉ đổi cỡ chữ và lề ngang, không bao
 * giờ đổi vùng chạm.
 */
/**
 * Chiều cao VẼ RA của viên — thấp hơn sàn 44pt.
 *
 * Cao đúng 44 làm viên trông múp míp, và một hàng bốn năm viên chiếm mất một khoảng dọc lớn
 * cho thứ chỉ là nhãn ngắn. Vùng CHẠM vẫn đủ chuẩn nhờ `hitSlop` bù đúng phần thiếu — mắt
 * thấy viên gọn, ngón tay vẫn có 44pt.
 */
const CHIP_HEIGHT = { sm: 32, md: 38 } as const;

export function Chip({
  label,
  selected = false,
  icon,
  leading,
  onPress,
  grow = false,
  size = 'md',
  variant = 'filled',
}: ChipProps) {
  const segmented = variant === 'segmented';
  const idleBg = segmented ? 'transparent' : colors.surfaceMuted;
  const idleBorder = segmented ? 'transparent' : colors.border;

  const body = (
    <XStack
      ai="center"
      jc="center"
      gap={space.xs}
      bg={selected ? colors.primary : idleBg}
      bc={selected ? colors.primary : idleBorder}
      bw={1}
      br={radius.pill}
      px={size === 'sm' ? space.sm : space.md}
      minHeight={CHIP_HEIGHT[size]}
    >
      {leading}
      {icon ? (
        <Ionicons name={icon} size={15} color={selected ? colors.onPrimary : colors.textMuted} />
      ) : null}
      <Text
        col={selected ? colors.onPrimary : colors.text}
        fos={size === 'sm' ? fontSize.label : fontSize.bodySm}
        fow={selected ? fontWeight.semibold : fontWeight.medium}
        numberOfLines={1}
      >
        {label}
      </Text>
    </XStack>
  );

  if (!onPress) return body;

  const slop = Math.ceil((sizing.touchTarget - CHIP_HEIGHT[size]) / 2);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      hitSlop={{ top: slop, bottom: slop }}
      style={grow ? { flex: 1 } : undefined}
    >
      {body}
    </Pressable>
  );
}
