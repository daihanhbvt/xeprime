import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motionMs } from '@/theme/motion';

/**
 * Dải tô CHẠY DẦN tới `fraction` (0–1) bằng `scaleX` neo mép trái — chỉ transform, luồng UI.
 * Chỉ là lớp hình: con số thật do nơi gọi (dữ liệu server) quyết.
 */
export function GrowFill({
  fraction,
  color,
  style,
}: {
  fraction: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const target = Math.min(1, Math.max(0, fraction));
  const p = useSharedValue(reduceMotion ? target : 0);
  useEffect(() => {
    p.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionMs.overlay * 2, easing: Easing.out(Easing.cubic) });
  }, [p, target, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: color, transformOrigin: 'left' },
        style,
        animated,
      ]}
    />
  );
}
