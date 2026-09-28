import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { IconName } from '@/components/ui/Chip';
import { IconDisc } from '@/components/ui/IconDisc';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';

const TONE = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  primary: { fg: colors.primaryActive, bg: colors.primaryLight },
  danger: { fg: colors.danger, bg: colors.dangerSurface },
} as const;

/**
 * Một dòng HÀNH ĐỘNG trong tấm trượt của lịch — không phải một lựa chọn giá trị.
 *
 * Cố ý không dùng [`MenuOption`](../../../components/ui/MenuOption.tsx): dòng đó mang
 * `accessibilityRole="radio"` vì nó CHỌN một giá trị trong nhóm. "Đặt xe", "Khóa xe", "Đặt giá"
 * thì mỗi dòng mở một luồng riêng và không có cái nào "đang được chọn" — đọc ra là radio thì
 * người dùng trình đọc màn hình nghe thấy một nhóm lựa chọn không có mục nào bật, và chờ một
 * trạng thái không bao giờ tới.
 *
 * `trailing` chở phần điều khiển của riêng dòng (công tắc khoá nhanh của thẻ ngày); có nó thì cả
 * dòng KHÔNG còn là một nút — xem `pressable`.
 */
export function SheetActionRow({
  label,
  hint,
  icon,
  tone = 'neutral',
  trailing,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: IconName;
  tone?: 'neutral' | 'primary' | 'danger';
  trailing?: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <XStack
      ai="center"
      gap={space.sm}
      py={space.sm}
      minHeight={sizing.touchTarget}
      opacity={disabled ? 0.5 : 1}
    >
      <IconDisc icon={icon} tone={TONE[tone].fg} surface={TONE[tone].bg} />
      <YStack f={1} gap={1}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
          {label}
        </Text>
        {hint ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {hint}
          </Text>
        ) : null}
      </YStack>
      {trailing ?? <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textMuted} />}
    </XStack>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
    >
      {body}
    </Pressable>
  );
}
