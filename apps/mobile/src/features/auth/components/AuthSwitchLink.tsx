import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

export function AuthSwitchLink({
  prompt,
  actionLabel,
  onPress,
  disabled = false,
}: {
  prompt: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <XStack ai="center" jc="center" gap={space.xs} flexWrap="wrap">
      <Text col={colors.textMuted} fos={fontSize.body}>
        {prompt}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        hitSlop={space.sm}
      >
        <Text
          col={disabled ? colors.textDisabled : colors.primaryActive}
          fos={fontSize.body}
          fow={fontWeight.semibold}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </XStack>
  );
}
