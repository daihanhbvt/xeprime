import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { XP_TOKENS } from '@xeprime/ui';
import { duration, easing } from '@/theme/motion';

/** Thẻ đang "nổi" (nhấn, hoặc ở giữa băng chuyền) — `Card` cung cấp, ảnh trong thẻ đọc. */
export const CardHighlightContext = createContext(false);

/** = `--xp-motion-scale-media-hover` của web (ảnh xe to lên khi rê chuột vào thẻ). */
const ZOOM = Number(XP_TOKENS['motion-scale-media-hover'] ?? 1.05);

/**
 * Bản cảm ứng của `.card:hover .image { transform: scale(...) }` trên trang chủ web: ảnh trong
 * thẻ phóng nhẹ khi thẻ nổi. Bọc ẢNH (khung cha phải `overflow: hidden` để ảnh không tràn).
 * Chạy trên UI thread, chỉ đổi theo trạng thái nổi — không chạy khi mount hay khi render lại.
 */
export function HighlightZoom({ children, scale = ZOOM }: { children: ReactNode; scale?: number }) {
  const active = useContext(CardHighlightContext);
  const reduced = useReducedMotion();
  const value = useSharedValue(1);
  useEffect(() => {
    value.value = withTiming(active && !reduced ? scale : 1, {
      duration: duration.base,
      easing: Easing.bezier(...easing.standard),
    });
  }, [active, reduced, scale, value]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}
