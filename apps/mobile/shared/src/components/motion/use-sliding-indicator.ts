import { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { duration, easing } from '@/theme/motion';

/** Bề rộng gốc của thanh chỉ báo — bề rộng thật đạt bằng `scaleX` (chỉ transform, luồng UI). */
export const INDICATOR_BASE_WIDTH = 100;

interface Slot {
  x: number;
  width: number;
}

/**
 * Thanh chỉ báo TRƯỢT giữa các tab có bề rộng KHÁC nhau. Mỗi tab gắn `onItemLayout(index)`;
 * thanh (absolute, `left: 0`, bề rộng `INDICATOR_BASE_WIDTH`) nhận `indicatorStyle`.
 * Chưa đo xong ô đang chọn thì `ready = false` — màn vẽ chỉ báo tĩnh như cũ, không chớp.
 */
export function useSlidingIndicator(activeIndex: number, count: number) {
  const reduceMotion = useReducedMotion();
  const [slots, setSlots] = useState<Array<Slot | undefined>>([]);
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useSharedValue(false);

  const onItemLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      const { x: nx, width: nw } = event.nativeEvent.layout;
      setSlots((prev) => {
        const cur = prev[index];
        if (cur && cur.x === nx && cur.width === nw) return prev;
        const next = prev.slice(0, count);
        next[index] = { x: nx, width: nw };
        return next;
      });
    },
    [count],
  );

  const slot = slots[activeIndex];
  useEffect(() => {
    if (!slot) return;
    const config = { duration: duration.base, easing: Easing.bezier(...easing.standard) };
    const instant = reduceMotion || !placed.value;
    x.value = instant ? slot.x : withTiming(slot.x, config);
    width.value = instant ? slot.width : withTiming(slot.width, config);
    placed.value = true;
  }, [slot, reduceMotion, x, width, placed]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value + width.value / 2 - INDICATOR_BASE_WIDTH / 2 },
      { scaleX: width.value / INDICATOR_BASE_WIDTH },
    ],
  }));

  return { onItemLayout, indicatorStyle, ready: Boolean(slot) };
}
