import { useEffect } from 'react';
import {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { motionMs } from '@/theme/motion';

/** Biên độ lắc ngang của ô nhập khi vừa chuyển sang lỗi (dp). */
const SHAKE_DX = 5;

/**
 * Phản hồi của ô nhập: LẮC NHẸ đúng lúc ô chuyển sang lỗi (không lắc lại mỗi lần render) và
 * VIỀN đổi màu mượt giữa nghỉ ↔ focus/lỗi. Trả hai style: `shake` cho khung ngoài, `border` cho
 * lớp viền phủ (absolute, không bắt chạm). Giảm chuyển động ⇒ đổi màu tức thì, không lắc.
 */
export function useFieldFeedback({
  invalid,
  highlighted,
  restColor,
  activeColor,
}: {
  invalid: boolean;
  highlighted: boolean;
  restColor: string;
  activeColor: string;
}) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const on = useSharedValue(highlighted ? 1 : 0);

  useEffect(() => {
    on.value = reduceMotion ? (highlighted ? 1 : 0) : withTiming(highlighted ? 1 : 0, { duration: motionMs.press * 2 });
  }, [highlighted, on, reduceMotion]);

  useEffect(() => {
    if (!invalid || reduceMotion) return;
    x.value = withSequence(
      withTiming(-SHAKE_DX, { duration: 45 }),
      withTiming(SHAKE_DX, { duration: 70 }),
      withTiming(-SHAKE_DX / 2, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
  }, [invalid, reduceMotion, x]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const border = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [restColor, activeColor]),
  }));
  return { shake, border };
}
