import { Ionicons } from '@/components/icons/Ionicons';
import { Text, YStack } from 'tamagui';
import {
  FIELD_V2,
  FieldLabel,
  FieldMessage,
  FieldShell,
  inLabelHint,
  belowHint,
  useFieldAppearance,
  useFieldGap,
} from './Field';
import { LineIcon } from '@/components/icons/LineIcon';
import type { IconName } from './Chip';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontWeight, iconSize, space } from '@/theme/tokens';

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
  const colors = useColors();
  const filled = value.length > 0;
  const fieldGap = useFieldGap();
  const v2 = useFieldAppearance() === 'v2';

  return (
    <YStack gap={fieldGap}>
      <FieldLabel label={label} required={required} hint={inLabelHint(hint)} />

      <FieldShell
        onPress={onPress}
        invalid={Boolean(error)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${filled ? value : placeholder}`}
      >
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} /> : null}
        {/* Bộ ô `v2`: chữ + mũi tên "Down 2" Figma y như `SelectControl` - ô mở tấm chọn trông như mọi ô chọn khác. */}
        <Text
          f={1}
          py={space.sm}
          col={filled ? colors.text : v2 ? colors.textPlaceholder : colors.placeholder}
          fos={v2 ? FIELD_V2.selectFontSize : fieldFontSize.value}
          fow={filled && !v2 ? fontWeight.medium : fontWeight.regular}
          numberOfLines={1}
        >
          {filled ? value : placeholder}
        </Text>
        {v2 ? (
          <LineIcon name="chevron-down-md" size={FIELD_V2.icon} color={colors.placeholder} />
        ) : (
          <Ionicons name="chevron-down" size={iconSize.sm} color={colors.textMuted} />
        )}
      </FieldShell>

      <FieldMessage error={error} hint={belowHint(hint)} />
    </YStack>
  );
}
