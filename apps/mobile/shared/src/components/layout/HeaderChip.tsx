import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { YStack } from 'tamagui';
import type { IconName } from '@/components/ui/Chip';
import { CountBadge } from '@/components/ui/CountBadge';
import { elevation } from '@/theme/elevation';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { radius, sizing } from '@/theme/tokens';

/** Đường kính chip — `.chip` của `HeaderIconButton.module.css` web: 40px. */
export const HEADER_CHIP_SIZE = 40;
/** Cỡ nét biểu tượng — `.glyph` web: 18px. */
const GLYPH = 18;
/** Vùng chạm 48dp (≥ 44dp WCAG) quanh vòng 40dp. */
const HIT_SLOP = (sizing.touchTarget - HEADER_CHIP_SIZE) / 2;

/**
 * Nút tròn của thanh trên — bản native của `HeaderIconButton` web: vòng 40dp nền `surface`
 * (`--xp-color-bg-container`), viền 1px `border`, bóng `shadow-card`, biểu tượng 18dp
 * `textMuted` (`--xp-color-text-secondary`). Màu đi theo palette sáng/tối như biến CSS bên web.
 *
 * Huy hiệu ĐÈ lên góc trên-phải vòng tròn (web `offset={[-3, 3]}`), kèm vành 2dp cùng màu nền để
 * con số không dính vào viền.
 */
export function HeaderChip({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  badgeCount = 0,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  badgeCount?: number;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={HIT_SLOP}
      style={styles.hit}
    >
      {/*
        Vòng tròn là một View RIÊNG bên trong; Pressable ngoài không có nền, không bóng. Nếu đặt
        nền + elevation lên chính Pressable thì Android vẽ một ô vuông xám quanh vòng tròn khi
        nút vừa được bấm và palette đổi ngay trong lượt bấm đó (đúng nút sáng/tối). Phản hồi
        bấm chỉ đổi viền của vòng tròn.
      */}
      {({ pressed }) => (
        <>
          <YStack style={[styles.chip, pressed ? styles.pressed : null]}>
            <Ionicons name={icon} size={GLYPH} color={colors.textMuted} />
          </YStack>
          {badgeCount > 0 ? (
            <YStack style={styles.badge}>
              <CountBadge count={badgeCount} tone="danger" size="sm" />
            </YStack>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  hit: { height: HEADER_CHIP_SIZE, width: HEADER_CHIP_SIZE },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: HEADER_CHIP_SIZE,
    justifyContent: 'center',
    width: HEADER_CHIP_SIZE,
    ...elevation.card,
  },
  pressed: { borderColor: colors.primary },
  badge: {
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    position: 'absolute',
    right: -6,
    top: -6,
  },
}));
