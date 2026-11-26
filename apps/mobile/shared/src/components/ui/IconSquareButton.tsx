import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { YStack } from 'tamagui';
import { themed, useColors } from '@/theme/ThemeProvider';
import { gradients, radius, sizing } from '@/theme/tokens';
import { CountBadge } from './CountBadge';

export type IconSquareTone = 'outline' | 'brand' | 'zalo' | 'muted' | 'dangerSoft';
export type IconSquareSize = 'sm' | 'md' | 'card' | 'lg';

/**
 * Figma "Button" icon-only v2: ô 36 (đệm 8 · icon 20), bo 12; `lg` 44 cho chỗ cần ô chạm lớn;
 * `sm` 32 bo 8 (icon 16) - nút sửa/xoá trên dòng (Danh mục thu/chi `24512:129056`); `card` 40
 * (đệm 10 · icon 20) - nút góc đầu thẻ của Quản lý gian hàng (`24231:113348`).
 */
const BOX: Readonly<Record<IconSquareSize, number>> = { sm: 32, md: 36, card: 40, lg: 44 };
const RADIUS: Readonly<Record<IconSquareSize, number>> = {
  sm: radius.thumb,
  md: radius.control,
  card: radius.control,
  lg: radius.control,
};

const useSkin = themed<Record<IconSquareTone, { bg: string; border: string }>>((colors) => ({
  /** Nền trắng, viền `stroke/gray-low300` (nút "Đơn đã kết thúc", Nhắn tin, Gọi). */
  outline: { bg: colors.surface, border: colors.borderInput },
  /** Dải vàng `Gradient/Special` (nút "+") - viền vàng đậm theo luật "nút luôn có viền". */
  brand: { bg: colors.primary, border: colors.primaryHover },
  /** Nút Zalo: nền `information-low`, viền `information-300`. */
  zalo: { bg: colors.infoLow, border: colors.infoBorder },
  /**
   * Nút sửa trên dòng: nền `bg/gray-50`. Figma không vẽ viền; viền `stroke/gray-low200` theo luật
   * "nút có nền luôn có viền" của app.
   */
  muted: { bg: colors.background, border: colors.border },
  /** Nút xoá trên dòng: nền `status/error-low`, viền `status/error-300` (cùng luật trên). */
  dangerSoft: { bg: colors.dangerSurface, border: colors.dangerBorder },
}));

/**
 * Nút VUÔNG chỉ có icon của design v2 — hàng nút thanh trang ("Đơn đã kết thúc", "+"), cụm liên hệ
 * khách (Nhắn tin · Gọi · Zalo). Ô vẽ ra 36, vùng chạm bù bằng `hitSlop` tới `sizing.touchTarget`.
 *
 * `badge` là số đè góc phải trên (CountBadge cỡ nhỏ) — dùng khi con số là thông tin của chính
 * nút (số đơn đã kết thúc), không phải để báo việc.
 */
export const IconSquareButton = memo(function IconSquareButton({
  label,
  onPress,
  children,
  tone = 'outline',
  size = 'md',
  badge,
  dimmed = false,
  busy = false,
  disabled = false,
}: {
  /** Tên của nút cho trình đọc màn hình — nút không có chữ nên BẮT BUỘC. */
  label: string;
  onPress: () => void;
  /** Icon (đã tô màu ở nơi gọi). */
  children: ReactNode;
  tone?: IconSquareTone;
  size?: IconSquareSize;
  badge?: number | undefined;
  /** Mờ nhưng VẪN nhận chạm (nơi gọi nói lý do) - khác `disabled`. */
  dimmed?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const skin = useSkin()[tone];
  const box = BOX[size];
  const slop = Math.max(0, Math.ceil((sizing.touchTarget - box) / 2));
  return (
    <Pressable
      onPress={busy || disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || dimmed, busy }}
      hitSlop={slop}
      style={({ pressed }) => ({ opacity: dimmed || disabled ? 0.45 : pressed ? 0.7 : 1 })}
    >
      <YStack
        w={box}
        h={box}
        ai="center"
        jc="center"
        br={RADIUS[size]}
        bw={1}
        bc={skin.border}
        bg={skin.bg}
        ov="hidden"
      >
        {tone === 'brand' ? (
          <LinearGradient
            colors={gradients.walletCta.colors}
            locations={gradients.walletCta.locations}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : children}
      </YStack>
      {badge !== undefined && badge > 0 ? (
        <YStack pos="absolute" top={-BADGE_OFFSET} right={-BADGE_OFFSET} pointerEvents="none">
          <CountBadge count={badge} tone="neutral" size="sm" />
        </YStack>
      ) : null}
    </Pressable>
  );
});

/** `bg-gradient-to-r`: trái → phải. */
const GRADIENT_START = { x: 0, y: 0.5 } as const;
const GRADIENT_END = { x: 1, y: 0.5 } as const;
/** Viên số lệch ra góc như `Badge` của web. */
const BADGE_OFFSET = 6;
