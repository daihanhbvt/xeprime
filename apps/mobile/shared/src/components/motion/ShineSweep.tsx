import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/*
 * Vệt sáng chạy qua NÚT CHÍNH: một dải trắng mờ nghiêng quét trái → phải trong `SWEEP_MS`, nghỉ
 * `PAUSE_MS` rồi lặp. Dùng chung cho `Button` (variant primary/gradient) và `GradientButton` của
 * trang chủ - một chỗ định nhịp cho cả app.
 */
const SWEEP_MS = 750;
const PAUSE_MS = 1500;
const FIRST_DELAY_MS = 600;
const BAND = 64;
const SKEW = '-20deg';
const COLORS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0)'] as const;

const styles = StyleSheet.create({
  band: { position: 'absolute', top: -8, bottom: -8, left: 0, width: BAND },
});

/**
 * Đặt BÊN TRONG khung nút đã có `overflow: 'hidden'` + bo góc: vệt sáng phủ kín khung (absoluteFill),
 * tự đo bề ngang, bị cắt theo bo góc của khung. Không nhận chạm (`pointerEvents="none"`).
 *
 * Chỉ translateX/skewX trên luồng UI. Tắt hẳn khi người dùng bật "Giảm chuyển động".
 */
export function ShineSweep() {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || width <= 0) return;
    progress.value = 0;
    progress.value = withDelay(
      FIRST_DELAY_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
          withDelay(PAUSE_MS, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, width, progress]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAND + progress.value * (width + BAND * 2) }, { skewX: SKEW }],
  }));

  if (reduceMotion) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {width > 0 ? (
        <Animated.View style={[styles.band, bandStyle]}>
          <LinearGradient
            colors={COLORS}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
