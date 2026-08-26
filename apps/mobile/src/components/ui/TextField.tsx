import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, TextInput, type TextInputProps } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  icon?: IconName;
  placeholder?: string;
  secureTextEntry?: boolean;
  editable?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
}

/** Form state ở React Hook Form, không Redux (ADR 0004). */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  icon,
  secureTextEntry,
  ...inputProps
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const error = fieldState.error?.message;

  const borderColor = error
    ? colors.danger
    : focused
      ? colors.primary
      : colors.border;

  return (
    <YStack gap={space.xs}>
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {label.toLocaleUpperCase()}
      </Text>

      <XStack
        ai="center"
        gap={space.sm}
        bg={colors.surfaceMuted}
        br={radius.md}
        bw={1}
        bc={borderColor}
        px={space.md}
        minHeight={sizing.touchTarget}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} /> : null}

        <TextInput
          value={String(field.value ?? '')}
          onChangeText={field.onChange}
          onBlur={() => {
            setFocused(false);
            field.onBlur();
          }}
          onFocus={() => setFocused(true)}
          secureTextEntry={secureTextEntry && !revealed}
          placeholderTextColor={colors.placeholder}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: fontSize.body,
            minHeight: sizing.touchTarget,
          }}
          {...inputProps}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            // Nhãn là TÊN Ô + trạng thái: một nút "con mắt" trần không nói được nó thuộc ô nào
            // khi màn có nhiều ô mật khẩu.
            accessibilityLabel={label}
            accessibilityState={{ selected: revealed }}
            hitSlop={space.sm}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </XStack>

      {error ? (
        <XStack ai="center" gap={space.xs}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text col={colors.danger} fos={fontSize.bodySm}>
            {error}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  );
}
