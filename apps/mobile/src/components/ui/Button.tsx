import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors } from '@/theme/colors';

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
        <Text style={[styles.label, secondary ? styles.labelSecondary : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    // Vùng chạm tối thiểu 44pt.
    minHeight: 48,
    paddingHorizontal: 16,
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
    backgroundColor: colors.disabled,
  },
  label: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  labelSecondary: {
    color: colors.text,
  },
});
