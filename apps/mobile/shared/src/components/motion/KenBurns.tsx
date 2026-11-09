import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useKenBurns } from './reveal-effects';

/** Khung ảnh Ken Burns chậm (scale 1→`to`, lặp đảo chiều) — chỉ transform; giảm chuyển động ⇒ tĩnh. */
export function KenBurns({
  children,
  style,
  to = 1.06,
  duration = 12000,
  enabled = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  to?: number;
  duration?: number;
  enabled?: boolean;
}) {
  const kb = useKenBurns(enabled, to, duration);
  return <Animated.View style={[style, kb]}>{children}</Animated.View>;
}
