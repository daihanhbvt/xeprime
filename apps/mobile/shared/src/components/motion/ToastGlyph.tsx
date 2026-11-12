import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useEffect } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';
import { spring } from '@/theme/motion';

export type ToastGlyphKind = 'success' | 'error' | 'other';

/**
 * Icon của toast có nhịp riêng: thành công NẢY vào (lò xo `pop`), lỗi LẮC ngang nhẹ. Chỉ animate
 * icon (không chạm khối có bóng của toast). Kèm rung thông báo tương ứng (no-op khi thiếu module).
 */
export function ToastGlyph({
  kind,
  ...icon
}: { kind: ToastGlyphKind } & ComponentProps<typeof Ionicons>) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion || kind !== 'success' ? 1 : 0.4);
  const x = useSharedValue(0);
  useEffect(() => {
    if (kind === 'success') haptics.success();
    if (kind === 'error') haptics.error();
    if (reduceMotion) return;
    if (kind === 'success') scale.value = withSpring(1, spring.pop);
    if (kind === 'error') {
      x.value = withSequence(
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 70 }),
        withTiming(-3, { duration: 70 }),
        withTiming(0, { duration: 60 }),
      );
    }
  }, [kind, reduceMotion, scale, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      {kind === 'success' ? (
        <DrawnTick size={icon.size ?? 24} color={String(icon.color ?? '')} />
      ) : (
        <Ionicons {...icon} />
      )}
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** Chiều dài nét tick trong hộp 24×24 (đủ dài cho `M7 12.5l3.2 3.2L17 9`). */
const TICK_LENGTH = 16;

/** Tick VẼ NÉT trong vòng tròn — `strokeDashoffset` chạy từ hết về 0 (luồng UI). */
function DrawnTick({ size, color }: { size: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const draw = useSharedValue(reduceMotion ? 0 : TICK_LENGTH);
  useEffect(() => {
    if (!reduceMotion) draw.value = withDelay(120, withTiming(0, { duration: 320 }));
  }, [draw, reduceMotion]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: draw.value }));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <AnimatedPath
        d="M7 12.5l3.2 3.2L17 9"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={TICK_LENGTH}
        animatedProps={props}
      />
    </Svg>
  );
}
