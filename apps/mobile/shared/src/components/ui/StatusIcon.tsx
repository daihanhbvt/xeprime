import { Ionicons } from '@expo/vector-icons';
import { YStack } from 'tamagui';
import { themed, useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import type { IconName } from './Chip';

export const STATUS_TONE = {
  SUCCESS: 'success',
  DANGER: 'danger',
  WARNING: 'warning',
} as const;

export type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE];

const useToneColors = themed<Readonly<Record<StatusTone, { fg: string; bg: string }>>>(
  (colors) => ({
    [STATUS_TONE.SUCCESS]: { fg: colors.success, bg: colors.successSurface },
    [STATUS_TONE.DANGER]: { fg: colors.danger, bg: colors.dangerSurface },
    [STATUS_TONE.WARNING]: { fg: colors.warning, bg: colors.warningSurface },
  }),
);

/** Đĩa 56px + quầng 8px = 72px tổng — đúng hình học `.doneBadge` của web. */
const CIRCLE = 56;
const HALO = 8;
const GLYPH = 28;

/**
 * Huy hiệu kết quả: **đĩa ĐẶC màu trạng thái, glyph TRẮNG, quầng nhạt bao quanh** — cùng hình
 * với `.doneBadge` bên web (`background: color-success; box-shadow: 0 0 0 8px color-success-bg`).
 *
 * Bản trước làm ngược: đĩa nền NHẠT với một dấu tích viền mảnh cùng màu nhạt bên trong, nên nó
 * đọc ra như một biểu tượng bị mờ chứ không phải một dấu xác nhận. Ở đây tương phản nằm giữa
 * glyph trắng và đĩa đặc, còn quầng lo phần "nổi khỏi nền trang".
 */
export function StatusIcon({ icon, tone }: { icon: IconName; tone: StatusTone }) {
  const colors = useColors();
  const TONE_COLORS = useToneColors();
  const { fg, bg } = TONE_COLORS[tone];

  return (
    <YStack p={HALO} br={radius.pill} bg={bg}>
      <YStack w={CIRCLE} h={CIRCLE} br={radius.pill} bg={fg} ai="center" jc="center">
        <Ionicons name={icon} size={GLYPH} color={colors.textInverse} />
      </YStack>
    </YStack>
  );
}
