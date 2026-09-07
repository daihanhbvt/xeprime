import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { XStack } from 'tamagui';
import { colors, radius, sizing } from '@/theme/tokens';
import type { IconName } from './Chip';

type Tone = 'plain' | 'surface' | 'primary' | 'danger';

const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  plain: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  surface: { bg: colors.surfaceMuted, fg: colors.text, border: colors.border },
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  /*
    `danger` không có NỀN: nó dành cho nút xoá đứng trên thanh tiêu đề, và một ô đỏ đặc ở góc
    phải header đọc ra như một cảnh báo đang xảy ra chứ không như một nút bấm được. Chỉ hình vẽ
    đỏ là đủ để nói "thao tác này phá huỷ" — câu xác nhận phía sau mới là lớp chặn thật.
  */
  danger: { bg: 'transparent', fg: colors.danger, border: 'transparent' },
};

interface IconButtonProps {
  icon: IconName;
  /** Bắt buộc: nút chỉ có biểu tượng thì đây là thứ DUY NHẤT trình đọc màn hình đọc được. */
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: number;
  disabled?: boolean;
}

/** Nút chỉ có biểu tượng, luôn đủ 44pt/48dp vùng chạm dù biểu tượng nhỏ tới đâu. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  size = 20,
  disabled = false,
}: IconButtonProps) {
  const skin = TONE[tone];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <XStack
        w={sizing.touchTarget}
        h={sizing.touchTarget}
        br={radius.pill}
        bg={skin.bg}
        bw={tone === 'plain' || tone === 'danger' ? 0 : 1}
        bc={skin.border}
        ai="center"
        jc="center"
      >
        <Ionicons name={icon} size={size} color={disabled ? colors.textDisabled : skin.fg} />
      </XStack>
    </Pressable>
  );
}
