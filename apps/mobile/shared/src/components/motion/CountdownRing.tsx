import { useEffect, useState } from 'react';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const STROKE = 2.5;
/** Một nhịp của đồng hồ (`useNow`) — vòng trượt LIÊN TỤC suốt nhịp thay vì nhảy từng giây. */
const TICK_MS = 1000;

/**
 * Vòng đếm ngược — CHỈ lớp hình. Mốc hết hạn và con số vẫn do `Countdown` đọc từ server; vòng
 * lấy phần còn lại lúc MỞ màn làm "đầy" (API không trả mốc bắt đầu cửa sổ) và rút dần về 0.
 */
export function CountdownRing({
  remainingMs,
  size,
  color,
  trackColor,
}: {
  remainingMs: number;
  size: number;
  color: string;
  trackColor: string;
}) {
  const reduceMotion = useReducedMotion();
  const [totalMs] = useState(() => Math.max(remainingMs, 1));
  const r = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.min(1, Math.max(0, remainingMs / totalMs));
  const f = useSharedValue(fraction);

  useEffect(() => {
    // Tới mốc của NHỊP KẾ để vòng chạy đều giữa hai lần tick.
    const next = Math.max(0, (remainingMs - TICK_MS) / totalMs);
    f.value = reduceMotion ? fraction : withTiming(next, { duration: TICK_MS, easing: Easing.linear });
  }, [f, fraction, remainingMs, totalMs, reduceMotion]);

  const props = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - f.value) }));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={STROKE} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={circumference}
        animatedProps={props}
      />
    </Svg>
  );
}
