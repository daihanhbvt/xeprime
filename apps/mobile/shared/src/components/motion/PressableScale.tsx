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
