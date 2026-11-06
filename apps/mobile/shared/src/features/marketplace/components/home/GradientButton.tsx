import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text, XStack } from 'tamagui';
import type { IconName } from '@/components/ui/Chip';
import { elevation } from '@/theme/elevation';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import {
  buttonHeight,
  buttonHitSlop,
  fontSize,
  fontWeight,
  gradients,
  radius,
  space,
} from '@/theme/tokens';

const SLOP_MD = buttonHitSlop(buttonHeight.md);

/*
 * Vệt sáng chạy qua nút chính (hằng cục bộ 06/11/2026 — hợp nhất vào `theme/motion` sau): một dải
 * trắng mờ nghiêng `SHINE_SKEW` quét trái → phải trong `SHINE_SWEEP_MS`, nghỉ `SHINE_PAUSE_MS` rồi
 * lặp. Chỉ translateX trên luồng UI; tắt khi người dùng bật giảm chuyển động.
 */
const SHINE_SWEEP_MS = 750;
const SHINE_PAUSE_MS = 1500;
const SHINE_FIRST_DELAY_MS = 600;
const SHINE_BAND = 64;
const SHINE_SKEW = '-20deg';
const SHINE_COLORS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0)'] as const;

const styles = StyleSheet.create({
  fill: { borderRadius: radius.control, overflow: 'hidden' },
  shine: { position: 'absolute', top: -8, bottom: -8, left: 0, width: SHINE_BAND },
});

/** Vệt sáng lặp định kỳ — nằm trong lớp `fill` (overflow hidden) nên tự bị cắt theo bo góc. */
function ShineSweep({ width }: { width: number }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || width <= 0) return;
    progress.value = 0;
    progress.value = withDelay(
      SHINE_FIRST_DELAY_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: SHINE_SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
          withDelay(SHINE_PAUSE_MS, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, width, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -SHINE_BAND + progress.value * (width + SHINE_BAND * 2) },
      { skewX: SHINE_SKEW },
    ],
  }));
  if (reduceMotion || width <= 0) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.shine, style]}>
      <LinearGradient
        colors={SHINE_COLORS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

interface GradientButtonProps {
  /** Vệt sáng chạy qua định kỳ — chỉ cho nút CHÍNH của màn (Tìm kiếm, Chọn thuê). */
  shine?: boolean;
  label: string;
  onPress: () => void;
  /** Biểu tượng đứng SAU nhãn — mũi tên của các nút mời trên trang chủ v2. */
  iconEnd?: IconName;
  /** Biểu tượng đứng TRƯỚC nhãn — nút Tìm kiếm của thẻ tìm xe (`CtaButton iconStart` web). */
  iconStart?: IconName;
  /** Bo góc — mặc định `border-radius-control` 12, chuẩn nút chung của app (chốt 28/10/2026). */
  radius?: number;
  /**
   * Chiều cao nút - mặc định `buttonHeight.lg` (44). Thẻ tìm kiếm truyền `SEARCH_FIELD_HEIGHT`
   * để nút thẳng hàng với các ô. Vùng chạm vẫn nới lên tối thiểu 44 bằng `hitSlop`.
   */
  height?: number;
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
  shine = false,
  height = buttonHeight.lg,
}: GradientButtonProps) {
  const slop = buttonHitSlop(height);
  const colors = useColors();
  const [width, setWidth] = useState(0);
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => shine && setWidth(Math.round(e.nativeEvent.layout.width))}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: slop, bottom: slop }}
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
        {shine ? <ShineSweep width={width} /> : null}
        <XStack ai="center" jc="center" gap={space.sm} h={height} px={space.lg}>
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
  // Figma dark (`19879:66181`): nền than #232323, viền xám #717680, chữ gold chính — khớp
  // `CtaButton .outline` tối bên web. Chưa có token tối cho hai màu này.
  const dark = useAppScheme().scheme === 'dark';
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
        bc={dark ? '#717680' : colors.primaryLight}
        bg={dark ? '#232323' : colors.surface}
      >
        <Text col={dark ? colors.primary : colors.primaryActive} fos={fontSize.body} fow={fontWeight.semibold}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}
