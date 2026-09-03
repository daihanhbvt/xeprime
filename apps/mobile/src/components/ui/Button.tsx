import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';

/**
 * `accent` = nền VÀNG NHẠT, chữ và viền vàng đậm.
 *
 * Không phải `primary` thu nhỏ: `primary` là nền vàng đặc dành cho hành động CHÍNH duy nhất của
 * màn. Một nhóm nút phụ tô nền đặc sẽ cạnh tranh trực tiếp với nó và người dùng mất chỗ để mắt
 * rơi vào. `accent` giữ được sắc thái thương hiệu mà vẫn đọc ra là hạng dưới.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
/**
 * `md` là mặc định và bằng đúng ngưỡng chạm 44pt. `sm` KHÔNG phá ngưỡng đó — nó giữ nguyên
 * chiều cao chạm được, chỉ rút đệm ngang và cỡ chữ, để một lưới thao tác phụ (Lịch sử tiền,
 * Quyết toán, Ảnh bàn giao…) không đọc ra ngang hàng với hành động chính của màn.
 */
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderInput },
  ghost: { bg: 'transparent', fg: colors.primaryActive, border: 'transparent' },
  danger: { bg: colors.dangerSurface, fg: colors.danger, border: colors.dangerSurface },
  accent: { bg: colors.primaryLight, fg: colors.primaryActive, border: colors.primary },
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
   * Chữ nút bị khoá dùng `textMuted`, KHÔNG `textDisabled`: cái sau đặt trên nền `surfaceMuted`
   * chỉ đạt tương phản ~1.6:1 nên nhãn gần như biến mất, và trạng thái khoá đọc thành "màn hình
   * lỗi" thay vì "chưa nhập đủ". Cái phân biệt khoá với bấm được là NỀN, không phải độ mờ chữ.
   */
  const fg = blocked ? colors.textMuted : skin.fg;

  return (
    /*
      Vỏ bắt chạm là `Pressable` của React Native, KHÔNG phải `onPress` của Tamagui:
      `accessibilityRole="button"` đặt trên stack Tamagui không nổi lên cây khả truy cập, và thứ
      không tìm được bằng vai thì trình đọc màn hình cũng không đọc ra là một nút. Bố cục bên
      trong vẫn là Tamagui — Tamagui cho HÌNH, primitive React Native cho THAO TÁC.
    */
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
        px={size === 'sm' ? space.md : space.lg}
        minHeight={size === 'lg' ? sizing.touchTarget + space.sm : sizing.touchTarget}
      >
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon ? (
              <Ionicons name={icon} size={size === 'sm' ? iconSize.sm : iconSize.md} color={fg} />
            ) : null}
            <Text
              col={fg}
              fos={
                size === 'lg' ? fontSize.bodyLg : size === 'sm' ? fontSize.bodySm : fontSize.body
              }
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
