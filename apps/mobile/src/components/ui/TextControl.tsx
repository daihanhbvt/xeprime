import { useMemo, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { Text, YStack } from 'tamagui';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { colors, fieldFontSize, sizing, space } from '@/theme/tokens';

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
  editable?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: TextInputProps['keyboardType'];
}) {
  const [focused, setFocused] = useState(false);

  /** Chiều cao một dòng — cùng nhịp 1.5 mà Tamagui dùng cho chữ trong ô (xem `TextField`). */
  const lineHeight = Math.round(fieldFontSize.value * 1.5);

  const inputStyle = useMemo(
    () => ({
      flex: 1,
      color: colors.text,
      fontSize: fieldFontSize.value,
      minHeight: multiline ? rows * lineHeight : sizing.touchTarget,
      paddingVertical: multiline ? space.sm : 0,
    }),
    [multiline, rows, lineHeight],
  );

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      <FieldShell
        focused={focused}
        invalid={Boolean(error)}
        disabled={!editable}
        align={multiline ? 'flex-start' : 'center'}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={inputStyle}
          placeholder={placeholder ?? ''}
          placeholderTextColor={colors.placeholder}
          editable={editable}
          multiline={multiline}
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

      <FieldMessage {...(error === undefined ? {} : { error })} {...(hint === undefined ? {} : { hint })} />
    </YStack>
  );
}
