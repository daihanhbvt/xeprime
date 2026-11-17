import { Text, XStack, YStack } from 'tamagui';
import { STATUS_COLOR, type StatusColor } from '@xeprime/types';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Chip có CHẤM - bản native của web `ToneDotBadge` (`StatusBadge.module.css .badge`, Figma
 * "_Badge" Partner-XePrime): bo 6, đệm 2/8, chữ 14/500 dòng 20, chấm 6 cùng màu chữ; nền nhạt +
 * viền cùng sắc để người mù màu vẫn phân biệt được bằng hình. Dùng cho chip chặng của chi tiết
 * đơn, nhãn "Khách quen"… - nơi web đặt `ToneDotBadge`.
 */
export function ToneDotBadge({ color, label }: { color: StatusColor | undefined; label: string }) {
  const colors = useColors();
  const tone = (() => {
    switch (color) {
      case STATUS_COLOR.SUCCESS:
        return { fg: colors.success, bg: colors.successSurface, border: colors.successBorder };
      case STATUS_COLOR.DANGER:
        return { fg: colors.danger, bg: colors.dangerSurface, border: colors.dangerBorder };
      case STATUS_COLOR.WARNING:
      case STATUS_COLOR.WAITING:
        return { fg: colors.warningStrong, bg: colors.warningSurface, border: colors.warningBorder };
      case STATUS_COLOR.INFO:
        return { fg: colors.infoStrong, bg: colors.infoSurface, border: colors.infoBorder };
      default:
        return { fg: colors.textMuted, bg: colors.neutralSurface, border: colors.border };
    }
  })();

  return (
    <XStack
      ai="center"
      alignSelf="flex-start"
      gap={DOT_GAP}
      px={space.sm}
      py={2}
      bw={1}
      bc={tone.border}
      br={radius.sm}
      bg={tone.bg}
    >
      <YStack w={DOT} h={DOT} br={radius.pill} bg={tone.fg} />
      <Text col={tone.fg} fos={fontSize.body} fow={fontWeight.medium} lh={20} numberOfLines={1}>
        {label}
      </Text>
    </XStack>
  );
}

/** Web `.badge { gap: var(--xp-space-6) }`, `::before { width: 6px; height: 6px }`. */
const DOT_GAP = 6;
const DOT = 6;
