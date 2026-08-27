import { Pressable, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { YStack } from 'tamagui';
import type { ReactNode } from 'react';
import { elevation } from '@/theme/elevation';
import { duration, easing } from '@/theme/motion';
import { colors, radius, space } from '@/theme/tokens';

type Tone = 'surface' | 'muted' | 'accent';
type Lift = 'flat' | 'card' | 'raised';

const TONE: Record<Tone, { bg: string; border: string }> = {
  surface: { bg: colors.surface, border: colors.border },
  muted: { bg: colors.surfaceMuted, border: colors.borderSubtle },
  accent: { bg: colors.primaryLight, border: colors.primaryLight },
};

interface CardProps {
  children: ReactNode;
  tone?: Tone;
  lift?: Lift;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * Mặt phẳng chứa nội dung. Gom bo góc + viền + bóng vào một chỗ để mọi thẻ trong app cùng độ
 * nổi; viết tay ở từng màn là mỗi màn một kiểu bóng.
 *
 * Không có `onPress` thì KHÔNG bọc `Pressable` — trình đọc màn hình sẽ không đọc nhầm một khối
 * hiển thị thành nút bấm được.
 */
export function Card({
  children,
  tone = 'surface',
  lift = 'card',
  padded = true,
  onPress,
  accessibilityLabel,
}: CardProps) {
  const skin = TONE[tone];
  const shadow: ViewStyle = lift === 'flat' ? {} : elevation[lift];

  const body = (
    <YStack
      bg={skin.bg}
      br={radius.lg}
      bw={1}
      bc={skin.border}
      ov="hidden"
      {...(padded ? { p: space.md } : {})}
      style={shadow}
    >
      {children}
    </YStack>
  );

  if (!onPress) return body;

  return <PressableCard onPress={onPress} label={accessibilityLabel}>{body}</PressableCard>;
}

/**
 * Phản hồi khi nhấn: lún xuống rồi bật lại, chạy trên UI thread.
 *
 * Đổi `opacity` thẳng qua `style={({ pressed }) => …}` là một bước nhảy tức thì — trên thẻ to
 * nó đọc ra như màn hình chớp chứ không như vật bị ấn xuống.
 */
function PressableCard({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress: () => void;
  label?: string;
}) {
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
    opacity: 1 - pressed.value * 0.12,
  }));

  const to = (value: number, ms: number) => {
    pressed.value = withTiming(value, {
      duration: ms,
      easing: Easing.bezier(...easing.standard),
    });
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...(label ? { accessibilityLabel: label } : {})}
      onPressIn={() => to(1, duration.fast * 0.6)}
      onPressOut={() => to(0, duration.fast)}
    >
      <Animated.View style={style}>{children}</Animated.View>
    </Pressable>
  );
}
