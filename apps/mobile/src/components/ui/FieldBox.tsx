import { Ionicons } from '@expo/vector-icons';
import { Text, YStack } from 'tamagui';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import type { IconName } from './Chip';
import { colors, fieldFontSize, fontWeight, iconSize, space } from '@/theme/tokens';

export function FieldBox({
  label,
  value,
  placeholder,
  icon,
  hint,
  error,
  required = false,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon?: IconName;
  hint?: string;
  error?: string;
  required?: boolean;
  onPress: () => void;
}) {
  const filled = value.length > 0;

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      <FieldShell
        onPress={onPress}
        invalid={Boolean(error)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${filled ? value : placeholder}`}
      >
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} /> : null}
        <Text
          f={1}
          py={space.sm}
          col={filled ? colors.text : colors.placeholder}
          fos={fieldFontSize.value}
          fow={filled ? fontWeight.medium : fontWeight.regular}
        >
          {filled ? value : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={iconSize.sm} color={colors.textMuted} />
      </FieldShell>

      <FieldMessage error={error} hint={hint} />
    </YStack>
  );
}
