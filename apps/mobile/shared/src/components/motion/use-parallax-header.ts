import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Ngôn ngữ "banner Home" dùng chung (06-09/11/2026): khối ảnh trôi chậm hơn nội dung, co nhẹ và
 * mờ dần khi cuộn qua; kéo quá đỉnh thì phóng nhẹ. Chạy TRÊN LUỒNG UI (worklet), chỉ transform +
 * opacity — không bao giờ setState theo cuộn (bài học lag 04/11). "Giảm chuyển động" ⇒ đứng yên.
 *
 * - Đầu trang: chỉ truyền `scrollY`.
 * - Khối giữa trang: truyền `offset` (vị trí đỉnh khối trong nội dung cuộn, đo bằng `onLayout`
 *   vào shared value) — hiệu ứng tính theo `scrollY - offset`; trôi bắt đầu khi khối vào màn
 *   (`enterDistance` trước đỉnh), co/mờ khi khối rời qua mép trên.
 */
export interface ParallaxHeaderOptions {
  /** Quãng cuộn (dp) để co/mờ tới mức cuối. */
  distance?: number;
  minScale?: number;
  minOpacity?: number;
  /** Tỉ lệ trôi so với tốc độ nội dung (0 = đứng theo nội dung). */
  factor?: number;
  /** Đỉnh khối trong nội dung cuộn — vắng ⇒ khối ở đầu trang. */
  offset?: SharedValue<number>;
  /** Cộng thêm vào `offset` (vd đỉnh vùng chứa khối) — tổng tính trong worklet. */
  baseOffset?: SharedValue<number>;
  /** Quãng trôi trước khi khối chạm mép trên (chỉ khi có `offset`), vd chiều cao màn. */
  enterDistance?: number;
  /** Trần dịch chuyển tuyệt đối (dp) — cho ảnh nền có lề tràn cố định. */
  maxShift?: number;
  /** Phóng nhẹ khi kéo quá đỉnh (chỉ đầu trang). */
  stretch?: boolean;
}

export const PARALLAX_DEFAULTS = {
  distance: 280,
  minScale: 0.92,
  minOpacity: 0.35,
  factor: 0.45,
} as const;

/** Trần phóng khi kéo quá đỉnh. */
const MAX_STRETCH = 0.25;

export function useParallaxHeader(scrollY: SharedValue<number>, options: ParallaxHeaderOptions = {}) {
  const reduceMotion = useReducedMotion();
  const {
    distance = PARALLAX_DEFAULTS.distance,
    minScale = PARALLAX_DEFAULTS.minScale,
    minOpacity = PARALLAX_DEFAULTS.minOpacity,
    factor = PARALLAX_DEFAULTS.factor,
    offset,
    baseOffset,
    enterDistance = 0,
    maxShift,
    stretch = true,
  } = options;

  return useAnimatedStyle(() => {
    if (reduceMotion) return {};
    const top = offset ? offset.value + (baseOffset ? baseOffset.value : 0) : 0;
    const rel = scrollY.value - top;
    if (!offset && rel < 0) {
      return stretch ? { transform: [{ scale: 1 + Math.min(-rel / distance, MAX_STRETCH) }] } : {};
    }
    const travel = offset ? Math.min(Math.max(rel, -enterDistance), distance) : rel;
    let shift = travel * factor;
    if (maxShift !== undefined) shift = Math.min(Math.max(shift, -maxShift), maxShift);
    return {
      opacity: interpolate(rel, [0, distance], [1, minOpacity], Extrapolation.CLAMP),
      transform: [
        { translateY: shift },
        { scale: interpolate(rel, [0, distance], [1, minScale], Extrapolation.CLAMP) },
      ],
    };
  });
}
