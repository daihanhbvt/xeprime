import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { pressScale, spring } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Độ co khi nhấn — mặc định `pressScale.card` (0.97). */
  scaleTo?: number;
}

/**
 * Vùng chạm CO NHẸ khi nhấn (lò xo trên luồng UI, chỉ `transform`). Dùng cho thẻ/nút lớn.
 * Tôn trọng "Giảm chuyển động". Không có haptic: `expo-haptics` chưa cài (không thêm package native).
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { children, style, scaleTo = pressScale.card, onPressIn, onPressOut, disabled, ...rest },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleIn = (event: GestureResponderEvent) => {
    if (!reduceMotion) scale.value = withSpring(scaleTo, spring.press);
    onPressIn?.(event);
  };
  const handleOut = (event: GestureResponderEvent) => {
    if (!reduceMotion) scale.value = withSpring(1, spring.press);
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});

/**
 * Co nhẹ khi nhấn cho một `Pressable` CÓ SẴN (dòng menu, dòng cài đặt) mà không đổi hàm `style`
 * theo `pressed` của nó: gắn `onPressIn`/`onPressOut` vào Pressable, `style` vào khung con
 * `Animated.View`. `enabled = false` ⇒ không co (vd. app Partner giữ nguyên hành vi cũ).
 */
export function usePressScale(enabled = true, scaleTo = 0.98) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const active = enabled && !reduceMotion;
  return {
    style,
    onPressIn: () => {
      if (active) scale.value = withSpring(scaleTo, spring.press);
    },
    onPressOut: () => {
      if (active) scale.value = withSpring(1, spring.press);
    },
  };
}
