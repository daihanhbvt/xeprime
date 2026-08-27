import { Ionicons } from '@expo/vector-icons';
import { YStack } from 'tamagui';
import { colors, radius } from '@/theme/tokens';
import type { IconName } from './Chip';

export const STATUS_TONE = {
  SUCCESS: 'success',
  DANGER: 'danger',
} as const;

export type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE];

const TONE_COLORS: Readonly<Record<StatusTone, { fg: string; bg: string }>> = {
  [STATUS_TONE.SUCCESS]: { fg: colors.success, bg: colors.successSurface },
  [STATUS_TONE.DANGER]: { fg: colors.danger, bg: colors.dangerSurface },
};

const CIRCLE = 72;
const GLYPH = 36;

export function StatusIcon({ icon, tone }: { icon: IconName; tone: StatusTone }) {
  const { fg, bg } = TONE_COLORS[tone];

  return (
    <YStack w={CIRCLE} h={CIRCLE} br={radius.pill} bg={bg} ai="center" jc="center">
      <Ionicons name={icon} size={GLYPH} color={fg} />
    </YStack>
  );
}
