import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { radius, space } from '@/theme/tokens';

/**
 * Nút kính mờ nổi trên ảnh - Figma Partner-XePrime "Button" `24175:60983` (Chi tiết xe: ← · ⋮):
 * kính mờ (`backdrop-blur 6`) bo 12, đệm 8, icon trắng 20. Nền kính TỐI thay trắng 20% của Figma (xem
 * `glass`) để icon trắng luôn nổi, kể cả trên ảnh sáng.
 *
 * `badge` (tuỳ chọn) vẽ ở góc trên-phải, ngoài khuôn bo của nút (vd. số việc cần xử lý).
 */
export const GlassIconButton = memo(function GlassIconButton({
  label,
  onPress,
  children,
  badge,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={space.sm}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <View style={styles.box}>
        {/* `intensity` 20 ≈ blur 6px của Figma trên cả iOS lẫn Android (Android cần `experimentalBlurMethod`). */}
        <BlurView
          intensity={BLUR_INTENSITY}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glass} />
        {children}
      </View>
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </Pressable>
  );
});

const BLUR_INTENSITY = 20;
/** Figma "Button": đệm 8 quanh icon 20 ⇒ ô 36. */
const PAD = 8;

const styles = StyleSheet.create({
  box: {
    padding: PAD,
    borderRadius: radius.control,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
   * Kính TỐI (26/11/2026): Figma vẽ kính trắng 20%, nhưng trên ảnh sáng (trời, cây, xe trắng) kính trắng +
   * blur thành một mảng sáng và icon trắng chìm mất. Kính tối giữ blur, icon trắng nổi trên mọi ảnh.
   * Màu cố định vì nút nằm trên ảnh, không đổi theo theme.
   */
  glass: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 13, 18, 0.28)' },
  badge: { position: 'absolute', top: -6, right: -6 },
  pressed: { opacity: 0.7 },
});
