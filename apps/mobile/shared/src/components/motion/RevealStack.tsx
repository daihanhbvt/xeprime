import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { ScrollReveal } from './ScrollReveal';
import { useRevealPop } from './reveal-effects';

/**
 * `YStack` mà MỖI con trực tiếp (bỏ qua `null`/`false`) tự bọc trong một `ScrollReveal` với
 * `index` tăng dần: các khối so le trượt lên lúc mở màn, khối nằm dưới màn hiện khi cuộn tới.
 * Thay cho việc bọc tay từng khối ở mỗi màn dựng bằng khối YStack thường (không có `Card`).
 *
 * Toàn bộ chạy trên luồng UI (xem `ScrollReveal`): chỉ transform, không opacity ⇒ an toàn cho
 * khối có bóng. Ngoài `ScrollRevealProvider` (app Partner, màn tắt reveal) ⇒ render tĩnh.
 * `start` = index của con đầu tiên, khi phía trên đã có khối reveal khác.
 */
export function RevealStack({
  children,
  start = 0,
  ...stackProps
}: ComponentProps<typeof YStack> & { start?: number }) {
  let index = start;
  return (
    <YStack {...stackProps}>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child) => (
          <ScrollReveal key={child.key ?? index} index={index++}>
            {child}
          </ScrollReveal>
        ))}
    </YStack>
  );
}

/**
 * Icon / ô biểu tượng "bật" (scale lò xo) khi khối `ScrollReveal` chứa nó bắt đầu hiện. KHÔNG đặt
 * lên view có elevation - mặc định `fade` tắt để chỉ dùng scale.
 */
export function RevealPop({
  children,
  delay = 120,
  fade = false,
}: {
  children: ReactNode;
  delay?: number;
  fade?: boolean;
}) {
  const style = useRevealPop(delay, 0.6, fade);
  return <Animated.View style={style}>{children}</Animated.View>;
}
