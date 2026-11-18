import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

export function AuthSwitchLink({
  prompt,
  actionLabel,
  onPress,
  disabled = false,
  size = 'md',
}: {
  /** `lg` - chữ 16/24 (Figma `24382:23384`, cột form app Partner); `md` - chữ thân 14. */
  size?: 'md' | 'lg';
  prompt: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="center" gap={space.xs} flexWrap="wrap">
      <Text col={colors.textMuted} fos={size === 'lg' ? fontSize.bodyLg : fontSize.body}>
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
          col={
            disabled ? colors.textDisabled : size === 'lg' ? colors.primary : colors.primaryActive
          }
          fos={size === 'lg' ? fontSize.bodyLg : fontSize.body}
          fow={fontWeight.semibold}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </XStack>
  );
}
