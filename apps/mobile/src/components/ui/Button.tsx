import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const VARIANT: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderInput },
  ghost: { bg: 'transparent', fg: colors.primaryActive, border: 'transparent' },
  danger: { bg: colors.dangerSurface, fg: colors.danger, border: colors.dangerSurface },
};

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Mặc định chiếm trọn bề ngang — nút hành động chính trên mobile hầu như luôn full width. */
  block?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  block = true,
}: ButtonProps) {
  const blocked = disabled || loading;
  const skin = VARIANT[variant];
  /*
   * Chữ của nút bị khoá dùng `textMuted`, KHÔNG dùng `textDisabled`.
   *
   * `textDisabled` là `rgba(26,26,26,.25)` — đặt lên nền `surfaceMuted` (#f5f3ef) thì tương
   * phản chỉ ~1.6:1, tức nhãn gần như biến mất. Người dùng không đọc được nút đang nói gì, và
   * trạng thái khoá đọc thành "màn hình lỗi" thay vì "chưa nhập đủ".
   *
   * Cái phân biệt khoá với bấm được là NỀN (be xám so với gold), không phải độ mờ của chữ.
   */
  const fg = blocked ? colors.textMuted : skin.fg;

  return (
    <Pressable
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: blocked }}
      style={({ pressed }) => [
        block ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <XStack
        ai="center"
        jc="center"
        gap={space.xs}
        bg={blocked && variant !== 'ghost' ? colors.surfaceMuted : skin.bg}
        bc={blocked ? colors.border : skin.border}
        bw={variant === 'ghost' ? 0 : 1}
        br={radius.pill}
        px={space.lg}
        minHeight={size === 'lg' ? sizing.touchTarget + 8 : sizing.touchTarget}
      >
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={iconSize.md} color={fg} /> : null}
            <Text
              col={fg}
              fos={size === 'lg' ? fontSize.bodyLg : fontSize.body}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {label}
            </Text>
          </>
        )}
      </XStack>
    </Pressable>
  );
}
