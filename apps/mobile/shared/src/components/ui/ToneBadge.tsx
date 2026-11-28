import { Text, YStack } from 'tamagui';
import type { DriverTripBadgeTone } from '@xeprime/domain';
import { themed } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

const useToneSkin = themed<Record<DriverTripBadgeTone, { bg: string; fg: string }>>((colors) => ({
  warning: { bg: colors.warningSurface, fg: colors.warning },
  success: { bg: colors.successSurface, fg: colors.success },
  info: { bg: colors.infoSurface, fg: colors.info },
  danger: { bg: colors.dangerSurface, fg: colors.danger },
  purple: { bg: colors.processingSurface, fg: colors.processing },
  neutral: { bg: colors.neutralSurface, fg: colors.textMuted },
}));

/**
 * Viên trạng thái kiểu Figma "_Badge" — bản native của `ToneBadge` web (bo 16, đệm 2/12, chữ 14/500,
 * KHÔNG viền). Dùng ở "Trung tâm Tài xế": tông đọc từ `driverLinkTone` / `driverTripBadges` của
 * `@xeprime/domain`, cùng nguồn với web.
 */
export function ToneBadge({
  tone,
  children,
  size = 'md',
}: {
  tone: DriverTripBadgeTone;
  children: string;
  /** `sm` = chip gọn trên thẻ danh sách (12/18, đệm 1/8) - người dùng 28/11/2026: chip trên thẻ quá to. */
  size?: 'md' | 'sm';
}) {
  const skin = useToneSkin()[tone];
  const sm = size === 'sm';
  return (
    <YStack alignSelf="flex-start" bg={skin.bg} px={sm ? space.sm : space.sm + space.xs} py={sm ? 1 : 2} br={radius.card}
      // Chip LUÔN có viền cùng màu chữ (người dùng chốt 28/10/2026) — như `StatusBadge`.
      bw={1}
      bc={skin.fg}
    >
      <Text
        col={skin.fg}
        fos={sm ? typeScale.label.fontSize : fontSize.body}
        {...(sm ? { lh: typeScale.label.lineHeight } : {})}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {children}
      </Text>
    </YStack>
  );
}
