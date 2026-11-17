import { Ionicons } from '@/components/icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { PressableScale } from '@/components/motion/PressableScale';
import { haptics } from '@/lib/haptics';
import { ShineSweep } from '@/components/motion/ShineSweep';
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
import { layout } from '@/theme/layout';

const SLOP_MD = buttonHitSlop(buttonHeight.md);

const styles = StyleSheet.create({
  fill: { borderRadius: radius.control, overflow: 'hidden' },
});

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
  return (
    // Nhấn: co nhẹ lò xo như `Button` chung (`PressableScale`), thay cho chớp mờ.
    <PressableScale
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: slop, bottom: slop }}
      style={[elevation.card, { borderRadius: corner }]}
    >
      <LinearGradient
        colors={gradients.primary.colors}
        locations={gradients.primary.locations}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fill, { borderRadius: corner }]}
      >
        {shine ? <ShineSweep /> : null}
        <XStack ai="center" jc="center" gap={space.sm} h={height} px={layout.padXLg}>
          {iconStart ? <Ionicons name={iconStart} size={19} color={colors.onPrimary} /> : null}
          <Text col={colors.onPrimary} fos={fontSize.body} fow={fontWeight.semibold}>
            {label}
          </Text>
          {iconEnd ? <Ionicons name={iconEnd} size={16} color={colors.onPrimary} /> : null}
        </XStack>
      </LinearGradient>
    </PressableScale>
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
        px={layout.padX}
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
