import { useEffect } from 'react';
import { View } from 'react-native';
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

const SIZE = 6;

/** Chấm nhịp đập cho trạng thái đang chờ (chờ duyệt / chờ thanh toán). Chỉ transform + opacity của vòng lan, không có bóng. */
export function PulseDot({ color }: { color: string }) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    p.value = withRepeat(withTiming(1, { duration: duration.pulse * 2, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [p, reduceMotion]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 1.6 }],
  }));
  return (
    <View style={{ width: SIZE, height: SIZE, marginRight: 4 }}>
      {!reduceMotion ? (
        <Animated.View
          style={[{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: color }, ring]}
        />
      ) : null}
      <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: color }} />
    </View>
  );
}
