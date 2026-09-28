import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';

interface SectionHeaderProps {
  title: string;
  /** Con số đứng cạnh tiêu đề (số xe, số kết quả) — nhỏ và mờ hơn, không cạnh tranh với tiêu đề. */
  count?: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, count, subtitle, action }: SectionHeaderProps) {
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <YStack f={1} gap={2}>
        <XStack ai="baseline" gap={space.xs}>
          <Text
            flexShrink={1}
            numberOfLines={1}
            col={colors.text}
            fos={fontSize.h3}
            fow={fontWeight.bold}
          >
            {title}
          </Text>
          {count ? (
            <Text flexShrink={0} col={colors.textMuted} fos={fontSize.bodySm}>
              {count}
            </Text>
          ) : null}
        </XStack>
        {subtitle ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={space.sm}
          style={{ minHeight: sizing.touchTarget, justifyContent: 'center', flexShrink: 0 }}
        >
          <XStack ai="center" gap={2}>
            <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {action.label}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primaryActive} />
          </XStack>
        </Pressable>
      ) : null}
    </XStack>
  );
}
