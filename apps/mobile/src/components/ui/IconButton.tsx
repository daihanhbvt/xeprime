import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { XStack } from 'tamagui';
import { colors, radius, sizing } from '@/theme/tokens';
import type { IconName } from './Chip';

type Tone = 'plain' | 'surface' | 'primary' | 'danger' | 'accent' | 'success' | 'info';

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
  /*
    Ba tông PHA NHẠT: nền là bản nhạt của màu, hình VÀ VIỀN là bản đậm.

    Dành cho nút hành động đứng trong một hàng nội dung — gọi điện, gửi thư, sao chép — nơi màu
    nói ra hành động sẽ xảy ra chứ không nói mức độ nguy hiểm. Một hàng nút xám giống hệt nhau
    thì phải đọc nhãn mới biết cái nào gọi cái nào chép; xanh lá / xanh dương / vàng thì nhận ra
    trước khi đọc.

    Viền cùng màu với hình chứ không cùng màu nền: một ô nền nhạt đặt trên thẻ trắng gần như
    không có mép, nên nó đọc ra như một vệt màu chứ không như một vật bấm được — mà đây đúng là
    thứ phải mời người ta chạm vào.

    Trên hàng tiêu đề thì được, NHƯNG chỉ ba tông này — chúng là nền NHẠT. Cấm ở đó là tông có
    nền đặc (`primary`) cho nút phụ: hai ô màu đặc cạnh nhau thì không còn cái nào là hành động
    chính, và chúng tranh chỗ với chính cái tiêu đề. Một ô nhạt đứng cạnh một ô đặc thì ngược
    lại — cùng họ màu, khác trọng lượng, đọc ngay ra cái nào là việc chính.
  */
  accent: { bg: colors.primaryLight, fg: colors.primaryActive, border: colors.primaryActive },
  success: { bg: colors.successSurface, fg: colors.success, border: colors.success },
  info: { bg: colors.infoSurface, fg: colors.info, border: colors.info },
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
        bw={skin.border === 'transparent' ? 0 : 1}
        bc={skin.border}
        ai="center"
        jc="center"
      >
        <Ionicons name={icon} size={size} color={disabled ? colors.textDisabled : skin.fg} />
      </XStack>
    </Pressable>
  );
}
