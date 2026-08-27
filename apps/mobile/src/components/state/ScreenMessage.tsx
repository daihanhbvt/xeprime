import { Ionicons } from '@expo/vector-icons';
import { Text, YStack } from 'tamagui';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Chip';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

interface ScreenMessageProps {
  title: string;
  description?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}

/** Trạng thái rỗng của cả một màn: biểu tượng, một câu nói rõ chuyện gì, và một lối đi tiếp. */
export function ScreenMessage({
  title,
  description,
  icon = 'file-tray-outline',
  actionLabel,
  onAction,
}: ScreenMessageProps) {
  return (
    <YStack f={1} ai="center" jc="center" gap={space.md} p={space.lg}>
      <YStack w={72} h={72} br={radius.pill} bg={colors.surfaceMuted} ai="center" jc="center">
        <Ionicons name={icon} size={30} color={colors.placeholder} />
      </YStack>

      <YStack ai="center" gap={space.xs}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} ta="center">
          {title}
        </Text>
        {description ? (
          <Text col={colors.textMuted} fos={fontSize.body} ta="center">
            {description}
          </Text>
        ) : null}
      </YStack>

      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" block={false} onPress={onAction} />
      ) : null}
    </YStack>
  );
}
