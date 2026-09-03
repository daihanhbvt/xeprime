import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
      {label}
      {required ? <Text col={colors.danger}> *</Text> : null}
    </Text>
  );
}

export function FieldMessage({
  error,
  hint,
}: {
  error?: string | undefined;
  hint?: string | undefined;
}) {
  if (error) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="alert-circle" size={iconSize.xs} color={colors.danger} />
        <Text f={1} col={colors.danger} fos={fontSize.bodySm}>
          {error}
        </Text>
      </XStack>
    );
  }
  if (hint) {
    return (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {hint}
      </Text>
    );
  }
  return null;
}

export function FieldShell({
  children,
  focused = false,
  invalid = false,
  align = 'center',
  onPress,
  accessibilityRole,
  accessibilityLabel,
}: {
  children: ReactNode;
  focused?: boolean;
  invalid?: boolean;
  align?: 'center' | 'flex-start';
  onPress?: () => void;
  accessibilityRole?: 'button';
  accessibilityLabel?: string;
}) {
  const active = invalid ? colors.danger : colors.primary;

  /*
   * Viền lúc NGHỈ dùng `borderInput`, KHÔNG dùng `border`.
   *
   * Nền ô là `surfaceMuted`, và trên một thẻ trắng thì `border` với nền đó chỉ chênh nhau khoảng
   * 1.08:1 — nhìn bằng mắt thường gần như không thấy đường viền, nên ô nhập trông như một mảng
   * xám trôi nổi. `borderInput` là tông đậm hơn dành riêng cho việc này.
   */
  return (
    <XStack
      ai={align}
      gap={space.sm}
      bg={colors.surfaceMuted}
      br={radius.sm}
      bw={1}
      bc={focused || invalid ? active : colors.borderInput}
      px={space.sm}
      minHeight={sizing.touchTarget}
      {...(onPress ? { onPress } : {})}
      {...(accessibilityRole ? { accessibilityRole } : {})}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {children}
    </XStack>
  );
}
