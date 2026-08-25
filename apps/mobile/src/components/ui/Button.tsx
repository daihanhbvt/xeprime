import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

interface ButtonProps {
  label: string;
  onPress: PressableProps['onPress'];
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: ButtonProps) {
  const blocked = disabled || loading;
  const secondary = variant === 'secondary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: blocked }}
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        secondary ? styles.secondary : styles.primary,
        pressed ? styles.pressed : null,
        blocked && !secondary ? styles.blocked : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.text : colors.onPrimary} />
      ) : (
        <Text
          style={[
            styles.label,
            secondary ? styles.labelSecondary : null,
            blocked && !secondary ? styles.labelBlocked : null,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: sizing.touchTarget,
    paddingHorizontal: space.md,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.borderInput,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  blocked: {
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    color: colors.onPrimary,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  labelSecondary: {
    color: colors.text,
  },
  // Nền disabled là xám nhạt — chữ `onPrimary` (đen trên gold) trên đó tưởng như còn bấm được.
  labelBlocked: {
    color: colors.textDisabled,
  },
});
