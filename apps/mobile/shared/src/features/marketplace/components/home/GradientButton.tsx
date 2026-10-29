import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import type { IconName } from '@/components/ui/Chip';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import {
  buttonHeight,
  buttonHitSlop,
  fontSize,
  fontWeight,
  gradients,
  radius,
  space,
} from '@/theme/tokens';

const SLOP_LG = buttonHitSlop(buttonHeight.lg);
const SLOP_MD = buttonHitSlop(buttonHeight.md);

const styles = StyleSheet.create({
  fill: { borderRadius: radius.control, overflow: 'hidden' },
});

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  /** Biểu tượng đứng SAU nhãn — mũi tên của các nút mời trên trang chủ v2. */
  iconEnd?: IconName;
  /** Biểu tượng đứng TRƯỚC nhãn — nút Tìm kiếm của thẻ tìm xe (`CtaButton iconStart` web). */
  iconStart?: IconName;
  /** Bo góc — mặc định `border-radius-control` 12, chuẩn nút chung của app (chốt 28/10/2026). */
  radius?: number;
  accessibilityLabel?: string;
}

/**
 * Nút viên thuốc nền gradient vàng của trang chủ v2 ("Đăng ký ngay", "Khám phá") — token
 * `gradient-primary`, cùng điểm màu với `CtaButton` bên web.
 *
 * Riêng của trang chủ, không thay `Button` chung: các màn nghiệp vụ vẫn dùng nút phẳng của app.
 */
export function GradientButton({
  label,
  onPress,
  iconEnd,
  iconStart,
  radius: corner = radius.control,
  accessibilityLabel,
}: GradientButtonProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: SLOP_LG, bottom: SLOP_LG }}
      style={({ pressed }) => [
        elevation.card,
        { borderRadius: corner, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <LinearGradient
        colors={gradients.primary.colors}
        locations={gradients.primary.locations}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fill, { borderRadius: corner }]}
      >
        <XStack ai="center" jc="center" gap={space.sm} minHeight={buttonHeight.lg} px={space.lg}>
          {iconStart ? <Ionicons name={iconStart} size={19} color={colors.onPrimary} /> : null}
          <Text col={colors.onPrimary} fos={fontSize.body} fow={fontWeight.semibold}>
            {label}
          </Text>
          {iconEnd ? <Ionicons name={iconEnd} size={16} color={colors.onPrimary} /> : null}
        </XStack>
      </LinearGradient>
    </Pressable>
  );
}

/** Nút viền "Xem tất cả" — nền trắng, viền vàng nhạt, chữ vàng (bản vẽ v2 `Action`). */
export function OutlineAction({
  label,
  onPress,
  fullWidth = false,
}: {
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={{ top: SLOP_MD, bottom: SLOP_MD }}
      style={({ pressed }) => ({
        alignSelf: fullWidth ? 'stretch' : 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <XStack
        ai="center"
        jc="center"
        minHeight={buttonHeight.md}
        px={space.md}
        br={radius.control}
        bw={1}
        bc={colors.primaryLight}
        bg={colors.surface}
      >
        <Text col={colors.primaryActive} fos={fontSize.body} fow={fontWeight.semibold}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}
