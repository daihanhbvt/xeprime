import { type ReactNode, useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { duration } from '@/theme/motion';

/** Biên độ trôi dọc của minh hoạ (dp). */
const FLOAT_DY = 4;

/**
 * Minh hoạ TRÔI NHẸ lên xuống (chỉ `translateY`, luồng UI) — dùng cho icon của trạng thái
 * rỗng/lỗi. Không đụng opacity, không bọc khối có bóng. Giảm chuyển động ⇒ đứng yên.
 */
export function Floating({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    y.value = withRepeat(
      withTiming(-FLOAT_DY, { duration: duration.pulse * 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(y);
  }, [y, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
