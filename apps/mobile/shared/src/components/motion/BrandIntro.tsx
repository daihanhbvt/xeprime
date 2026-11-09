import { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';

const LOGO = require('../../../assets/images/xeprime-mark.png') as number;
/** Tổng ≤ 900ms: logo phóng nhẹ rồi lớp phủ mờ dần. */
const INTRO_MS = 820;
const LOGO_WIDTH = 160;

/**
 * Màn chào JS NGAY SAU splash native (không giữ splash lâu hơn — xem `_layout.tsx`): cùng logo,
 * cùng cỡ, cùng nền nên cú bàn giao liền mạch; phủ lên app trong khi cây bên dưới vẫn render và
 * tải dữ liệu bình thường, không bắt chạm. Giảm chuyển động ⇒ không vẽ gì.
 */
export function BrandIntro() {
  const reduceMotion = useReducedMotion();
  const colors = useColors();
  const [done, setDone] = useState(reduceMotion);
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    p.value = withTiming(1, { duration: INTRO_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setDone)(true);
    });
  }, [p, reduceMotion]);

  const overlay = useAnimatedStyle(() => ({ opacity: p.value < 0.45 ? 1 : 1 - (p.value - 0.45) / 0.55 }));
  const logo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * 0.18 }] }));

  if (done) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }, overlay]}>
      <Animated.View style={logo}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  logo: { width: LOGO_WIDTH, height: LOGO_WIDTH },
});
