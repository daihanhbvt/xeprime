import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';

const DOT = 10;
const GAP = 8;
const RISE = 7;
const STEP_MS = 180;
const HALF_MS = 280;
const DOTS = [0, 1, 2] as const;

/**
 * Ba chấm nhảy lần lượt - chỉ báo "đang tải thêm" khi cuộn phân trang (người dùng 25/11/2026, theo kiểu Mioto).
 * Dùng thay `ActivityIndicator` / khung xương ở cuối danh sách cuộn vô hạn. "Giảm chuyển động" thì ba chấm đứng yên.
 */
export function DotsLoader({ color }: { color?: string }) {
  const colors = useColors();
  const tint = color ?? colors.primary;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: GAP, height: DOT + RISE * 2 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {DOTS.map((index) => (
        <Dot key={index} index={index} color={tint} />
      ))}
    </View>
  );
}

function Dot({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return undefined;
    progress.value = withDelay(
      index * STEP_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: HALF_MS, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: HALF_MS, easing: Easing.in(Easing.quad) }),
          // Nghỉ một nhịp để ba chấm đọc ra là một làn sóng, không phải nháy đồng loạt.
          withTiming(0, { duration: STEP_MS * 2 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [index, progress, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -RISE * progress.value }, { scale: 1 + 0.15 * progress.value }],
    opacity: 0.45 + 0.55 * progress.value,
  }));

  return <Animated.View style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }, style]} />;
}

/**
 * Chân danh sách khi đang tải trang kế - MỘT chỗ chung cho mọi danh sách cuộn vô hạn của cả hai app
 * (người dùng 25/11/2026): ba chấm nhảy ở giữa, đệm trên dưới `space.md`. Dùng làm `ListFooterComponent`
 * hoặc đặt thẳng cuối danh sách khi `isFetchingNextPage`.
 */
export function ListLoadingFooter() {
  return (
    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
      <DotsLoader />
    </View>
  );
}
