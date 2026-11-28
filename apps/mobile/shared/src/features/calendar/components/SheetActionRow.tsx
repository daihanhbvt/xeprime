import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';

/** Ô icon 36 (đệm 8 quanh icon 20) bo 12 - Figma "Filter Categories" `24729:82792`. */
const ICON_BOX_PAD = 8;
const ICON_SIZE = 20;
const ROW_PAD = 12;
const ROW_GAP = 8;

/**
 * Một dòng thao tác của các tấm lịch - Figma Lịch thuê xe "Thao tác" (`24729:82791`): thẻ viền
 * `stroke/gray-100` bo 16, đệm 12; ô icon nền `bg/gray-50` bo 12; nhãn 14/20 semibold + gợi ý 12/18
 * `text/gray/medium`; mũi tên "Right 2" bên phải.
 *
 * `highlighted` - dòng NỔI của Figma (dòng "Đặt xe"): nền `bg/primary-25`, viền `stroke/primary`,
 * ô icon `bg/primary-low`, nhãn `text/brand/primary`.
 */
export function SheetActionRow({
  label,
  hint,
  icon,
  highlighted = false,
  trailing,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: LineIconName;
  highlighted?: boolean;
  trailing?: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const body = (
    <XStack
      ai="center"
      gap={ROW_GAP}
      p={ROW_PAD}
      br={radius.card}
      bw={1}
      bc={highlighted ? colors.brandShape : colors.borderSubtle}
      bg={highlighted ? colors.brandWash : colors.surface}
      opacity={disabled ? 0.5 : 1}
    >
      <YStack p={ICON_BOX_PAD} br={radius.control} bg={highlighted ? colors.brandLow : colors.background}>
        <LineIcon
          name={icon}
          size={ICON_SIZE}
          color={highlighted ? colors.brandShape : colors.placeholder}
        />
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={highlighted ? colors.brandShape : colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            col={colors.textMuted}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.regular}
          >
            {hint}
          </Text>
        ) : null}
      </YStack>
      {trailing ?? <LineIcon name="chevron-right" size={ICON_SIZE} color={colors.placeholder} />}
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
      {({ pressed }) => <YStack opacity={pressed ? 0.7 : 1}>{body}</YStack>}
    </Pressable>
  );
}
