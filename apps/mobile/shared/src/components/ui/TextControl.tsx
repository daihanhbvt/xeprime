import { useMemo, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { useRevealOnFocus } from '@/components/layout/focus-reveal';
import { Text, YStack } from 'tamagui';
import { FieldLabel, FieldMessage, FieldShell, inLabelHint, belowHint } from './Field';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, sizing, space } from '@/theme/tokens';

/**
 * Ô nhập CHỮ, bản KHÔNG gắn với React Hook Form.
 *
 * Đối xứng với [`SelectControl`](./SelectControl.tsx) đứng cạnh `SelectField`, và vì cùng lý do:
 * có những giá trị sống ở state component chứ không ở form — "tên giấy tờ khác" trong khối tải
 * tài liệu chẳng hạn, nơi cả ba ô là trạng thái của MỘT thao tác tải lên chứ không phải một biểu
 * mẫu có nút Lưu.
 *
 * Trước khi có nó, những chỗ như vậy phải dựng `TextInput` trần và tự vẽ nhãn — mỗi màn một kiểu
 * viền, một kiểu đệm, một cỡ chữ. Hình dạng ở đây khớp từng pixel với `TextField`.
 */
export function TextControl({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  required = false,
  maxLength,
  multiline = false,
  rows = 3,
  scrollable = false,
  editable = true,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  /** Cao đúng `rows` dòng, dài hơn thì cuộn trong ô. Cần `multiline`. */
  scrollable?: boolean;
  editable?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: TextInputProps['keyboardType'];
}) {
  const colors = useColors();
  const revealOnFocus = useRevealOnFocus();
  const [focused, setFocused] = useState(false);

  /** Chiều cao một dòng — cùng nhịp 1.5 mà Tamagui dùng cho chữ trong ô (xem `TextField`). */
  const lineHeight = Math.round(fieldFontSize.value * 1.5);

  const inputStyle = useMemo(
    () => ({
      flex: 1,
      color: colors.text,
      fontSize: fieldFontSize.value,
      fontFamily: FONT_FAMILY.body,
      minHeight: multiline ? rows * lineHeight : sizing.touchTarget,
      paddingVertical: multiline ? space.sm : 0,
      ...(multiline && scrollable ? { maxHeight: rows * lineHeight + space.sm * 2 } : {}),
    }),
    [colors, multiline, rows, scrollable, lineHeight],
  );

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} hint={inLabelHint(hint)} />

      <FieldShell
        focused={focused}
        invalid={Boolean(error)}
        disabled={!editable}
        align={multiline ? 'flex-start' : 'center'}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
            revealOnFocus();
          }}
          onBlur={() => setFocused(false)}
          style={inputStyle}
          placeholder={placeholder ?? ''}
          placeholderTextColor={colors.placeholder}
          editable={editable}
          multiline={multiline}
          {...(multiline && scrollable ? { scrollEnabled: true } : {})}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...(maxLength === undefined ? {} : { maxLength })}
          {...(autoCapitalize === undefined ? {} : { autoCapitalize })}
          {...(keyboardType === undefined ? {} : { keyboardType })}
        />
      </FieldShell>

      {/*
        Bộ đếm ký tự chỉ hiện khi đã dùng quá 60% trần — nói trước còn hơn để người dùng gõ xong
        mới phát hiện bị cắt, nhưng hiện từ ký tự đầu thì nó chỉ là nhiễu. Cùng ngưỡng `TextField`.
      */}
      {maxLength !== undefined && value.length > maxLength * 0.6 ? (
        <Text col={colors.textMuted} fos={fieldFontSize.message} ta="right">
          {value.length}/{maxLength}
        </Text>
      ) : null}

      <FieldMessage
        {...(error === undefined ? {} : { error })}
        hint={belowHint(hint)}
      />
    </YStack>
  );
}
