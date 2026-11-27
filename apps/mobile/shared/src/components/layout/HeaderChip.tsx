import { Ionicons } from '@/components/icons/Ionicons';
import { Pressable } from 'react-native';
import { YStack } from 'tamagui';
import type { IconName } from '@/components/ui/Chip';
import { CountBadge, HEADER_BADGE_MAX } from '@/components/ui/CountBadge';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
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
 * Dạng VUÔNG - nút của đầu màn Tổng quan app Partner (Figma Overview MB "Action Icons" `24175:52349`):
 * ô 42 (đệm 10 + icon 20), bo 12, viền `stroke/gray-low200`, nền trắng, KHÔNG bóng; chấm số cao 12
 * nằm TRONG góc trên-phải ô (Figma left 20 · top 5), đè lên icon.
 */
const SQUARE = { size: 42, glyph: 20, badgeTop: 5, badgeLeft: 20 } as const;
const SQUARE_HIT_SLOP = Math.max(0, (sizing.touchTarget - SQUARE.size) / 2);

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
  skin,
  shape = 'round',
}: {
  /**
   * Biểu tượng: tên trong bộ icon nét design v2 (`{ line }` — web `LineIcon`, dùng ở khu khách) hoặc
   * tên Ionicons cho chỗ web còn icon AntD.
   */
  icon: IconName | { line: LineIconName };
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  badgeCount?: number;
  /**
   * Ghi đè màu của RIÊNG một chip — vd `.themeToggle` web ở giao diện tối có nền `bg-elevated` và
   * biểu tượng `primary-bright` thay vì vòng `surface` + biểu tượng `text-secondary` chung.
   */
  skin?: { glyph?: string; surface?: string };
  /** `round` - vòng 40 của thanh trên (mặc định); `square` - ô 42 bo 12 của đầu Tổng quan app Partner. */
  shape?: 'round' | 'square';
}) {
  const colors = useColors();
  const styles = useStyles();
  const square = shape === 'square';
  const glyph = square ? SQUARE.glyph : GLYPH;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={square ? SQUARE_HIT_SLOP : HIT_SLOP}
      style={square ? styles.hitSquare : styles.hit}
    >
      {/*
        Vòng tròn là một View RIÊNG bên trong; Pressable ngoài không có nền, không bóng. Nếu đặt
        nền + elevation lên chính Pressable thì Android vẽ một ô vuông xám quanh vòng tròn khi
        nút vừa được bấm và palette đổi ngay trong lượt bấm đó (đúng nút sáng/tối). Phản hồi
        bấm chỉ đổi viền của vòng tròn.
      */}
      {({ pressed }) => (
        <>
          <YStack
            style={[
              square ? styles.square : styles.chip,
              skin?.surface ? { backgroundColor: skin.surface } : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {typeof icon === 'string' ? (
              <Ionicons name={icon} size={glyph} color={skin?.glyph ?? colors.textMuted} />
            ) : (
              <LineIcon name={icon.line} size={glyph} color={skin?.glyph ?? colors.textMuted} />
            )}
          </YStack>
          {badgeCount > 0 ? (
            <YStack style={square ? styles.badgeSquare : styles.badge}>
              <CountBadge
                count={badgeCount}
                tone="danger"
                size={square ? 'xs' : 'sm'}
                max={HEADER_BADGE_MAX}
              />
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
  hitSquare: { height: SQUARE.size, width: SQUARE.size },
  square: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    height: SQUARE.size,
    justifyContent: 'center',
    width: SQUARE.size,
  },
  badgeSquare: { left: SQUARE.badgeLeft, position: 'absolute', top: SQUARE.badgeTop },
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
