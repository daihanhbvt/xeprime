import { XStack } from 'tamagui';
import { IconButton } from './IconButton';
import { iconSize, space } from '@/theme/tokens';

export function DetailArrow({
  label,
  onPress,
  inset = -space.sm,
}: {
  label: string;
  onPress: () => void;
  inset?: number;
}) {
  return (
    <XStack pos="absolute" top={inset} right={inset} zi={1} accessible={false}>
      <IconButton
        icon="chevron-forward"
        label={label}
        onPress={onPress}
        tone="plain"
        size={iconSize.md}
      />
    </XStack>
  );
}
