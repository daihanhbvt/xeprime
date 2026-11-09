import { useEffect } from 'react';
import {
  cancelAnimation,
  measure,
  useAnimatedRef,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { spring } from '@/theme/motion';
import { useWindowDimensions } from 'react-native';
import type Animated from 'react-native-reanimated';
import { useRevealChild, useRevealProgress, useRevealScrollY } from './ScrollReveal';

/*
 * Hiệu ứng cho phần tử CON của một khối `ScrollReveal` (ảnh, icon, hình minh hoạ KHÔNG bóng).
 * Tất cả chạy trên luồng UI; ngoài khối reveal hoặc giảm chuyển động ⇒ style rỗng (tĩnh).
 * Không dùng opacity cho thẻ có elevation.
 */

/** Pop-in: scale `from`→1 bằng lò xo (+ opacity nếu `fade`), trễ `delay` ms sau khi khối bắt đầu hiện. */
export function useRevealPop(delay = 0, from = 0.8, fade = true) {
  const parent = useRevealProgress();
  const reduceMotion = useReducedMotion();
  const active = Boolean(parent) && !reduceMotion;
  const v = useSharedValue(active ? 0 : 1);
  const s = useSharedValue(active ? from : 1);
  useAnimatedReaction(
    () => (parent ? parent.value > 0 : false),
    (go, prev) => {
      if (!active || !go || prev) return;
      v.value = withDelay(delay, withTiming(1, { duration: 260 }));
      s.value = withDelay(delay, withSpring(1, spring.pop));
    },
    [active, delay],
  );
  return useAnimatedStyle(() =>
    fade ? { opacity: v.value, transform: [{ scale: s.value }] } : { transform: [{ scale: s.value }] },
  );
}

/** Trượt vào từ một bên (`fromX` dp, âm = trái) + fade, trễ `delay`. */
export function useRevealSlideIn(delay = 0, fromX = -40) {
  const v = useRevealChild(delay);
  return useAnimatedStyle(() =>
    v ? { opacity: v.value, transform: [{ translateX: (1 - v.value) * fromX }] } : {},
  );
}

/** Bồng bềnh dọc ±`amplitude` dp, chu kỳ `period` ms, lệch pha `phaseMs`. */
export function useFloatLoop(amplitude = 3, period = 3500, phaseMs = 0) {
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(-amplitude);
  useEffect(() => {
    if (reduceMotion) return;
    y.value = withDelay(
      phaseMs,
      withRepeat(withTiming(amplitude, { duration: period / 2, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(y);
  }, [amplitude, period, phaseMs, reduceMotion, y]);
  return useAnimatedStyle(() => (reduceMotion ? {} : { transform: [{ translateY: y.value }] }));
}

/** Ken Burns chậm: scale 1→`to`, lặp đảo chiều. `enabled=false` ⇒ đứng ở 1. */
export function useKenBurns(enabled = true, to = 1.06, duration = 12000) {
  const reduceMotion = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || !enabled) {
      cancelAnimation(s);
      s.value = withTiming(1, { duration: 400 });
      return;
    }
    s.value = withRepeat(withTiming(to, { duration, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(s);
  }, [enabled, to, duration, reduceMotion, s]);
  return useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
}

/**
 * Parallax nhẹ theo cuộn cho một phần tử trong trang có `ScrollRevealProvider`: đo `pageY` thật
 * (luồng UI) mỗi nhịp cuộn, dịch `translateY = (pageY − giữa màn) × factor`, kẹp ±`maxShift`.
 * Khung đo PHẢI là view thật đứng yên: gắn `ref` kèm `collapsable={false}` (Android gộp view
 * rỗng thì `measure` trả null).
 * Trả `ref` gắn vào khung NGOÀI đứng yên (đo ở đó để không tự đuổi theo chính nó), `style` cho
 * lớp trong, `shift` để dựng thêm lớp trôi ngược. Ngoài provider / giảm chuyển động ⇒ tĩnh.
 */
export function useScrollParallax(factor = 0.06, maxShift = 18, baseScale = 1) {
  const scrollY = useRevealScrollY();
  const reduceMotion = useReducedMotion();
  const { height: viewportH } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const shift = useSharedValue(0);
  const fallback = useSharedValue(0);
  const source = scrollY ?? fallback;
  const active = Boolean(scrollY) && !reduceMotion;
  useAnimatedReaction(
    () => source.value,
    () => {
      if (!active) return;
      const m = measure(ref);
      if (!m) return;
      const raw = (m.pageY + m.height / 2 - viewportH / 2) * factor;
      shift.value = Math.min(Math.max(raw, -maxShift), maxShift);
    },
    [active, viewportH, factor, maxShift],
  );
  // `baseScale` > 1 phóng sẵn lớp ảnh để lúc trôi không hở mép khung.
  const style = useAnimatedStyle(() =>
    active ? { transform: [{ translateY: shift.value }, { scale: baseScale }] } : {},
  );
  return { ref, style, shift, active };
}
