import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, space, typeScale } from '@/theme/tokens';

/**
 * Một dòng của menu thao tác "CRUD Action" (Figma Partner-XePrime `24512:117598`): icon 20 + chữ
 * 14/22 đậm vừa, đệm 16/12. Native không có dropdown nên các dòng nằm trong `BottomSheet`.
 * `danger` chỉ tô ICON đỏ như Figma ("Ngừng hợp tác"), chữ giữ màu thường.
 */
export const ActionMenuRow = memo(function ActionMenuRow({
  icon,
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: LineIconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : 1,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      <XStack ai="center" gap={space.sm} px={space.md} py={12}>
        <LineIcon
          name={icon}
          size={iconSize.lg}
          color={danger ? colors.danger : colors.placeholder}
        />
        <Text
          f={1}
          col={colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={22}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
});
