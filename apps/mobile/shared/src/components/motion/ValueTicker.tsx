import { type ReactNode } from 'react';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { motionMs } from '@/theme/motion';

/** Khung vào của giá trị mới: trượt lên 8dp + mờ dần (luồng UI). */
const tickerEntering = FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
  .duration(motionMs.countUp)
  .reduceMotion(ReduceMotion.System);

/**
 * Đổi số MƯỢT: mỗi lần `value` đổi thì khối con mount lại với hiệu ứng trượt-vào. Chỉ chạy khi
 * giá trị đổi THẬT — render lại cùng giá trị không chạy lại. Không parse tiền (tiền là chuỗi,
 * ADR 0007), chỉ đổi hình thức hiện.
 */
export function ValueTicker({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Animated.View key={value} entering={tickerEntering}>
      {children}
    </Animated.View>
  );
}
