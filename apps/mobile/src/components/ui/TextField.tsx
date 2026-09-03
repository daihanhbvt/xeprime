import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, TextInput, type TextInputProps } from 'react-native';
import { Text, YStack } from 'tamagui';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { colors, fontSize, iconSize, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';

/** Chiều cao một dòng của ô nhiều dòng — cùng nhịp với `fontSize.body` × 1.4. */
const LINE_HEIGHT = 22;

/** Bộ đếm ký tự chỉ hiện khi đã dùng quá phần này của trần — trước đó nó chỉ là nhiễu. */
const COUNTER_AT = 0.6;

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  icon?: IconName;
  placeholder?: string;
  /**
   * Dòng chú thích dưới ô — luật nhập, định dạng mong đợi, hệ quả của việc điền.
   *
   * Đây là chỗ của những câu như "Tối thiểu 8 ký tự, có cả chữ và số". Nhét chúng vào
   * `placeholder` là hỏng hai lần: chữ biến mất ngay khi người dùng gõ ký tự đầu — đúng lúc họ
   * cần nó nhất — và ô nhập mất luôn ví dụ về thứ cần điền.
   *
   * Lỗi ĐÈ LÊN chú thích chứ không xếp thêm dưới: hai dòng nhỏ chồng nhau dưới một ô thì mắt
   * đọc dòng trên trước, mà dòng cần đọc là dòng lỗi.
   */
  hint?: string;
  /**
   * Hiện dấu `*` sau nhãn. THUẦN hiển thị — ràng buộc thật nằm ở schema yup của form và ở
   * DTO backend; đánh dấu ở đây mà quên ở schema thì ô vẫn gửi rỗng được.
   */
  required?: boolean;
  secureTextEntry?: boolean;
  /**
   * Ô nhiều dòng — lý do huỷ, ghi chú, nội dung đánh giá.
   *
   * Ở đây chứ không phải một component riêng vì nhãn, viền focus, lỗi và chú thích y hệt ô một
   * dòng; tách ra là hai bản sao của cùng một khung, và chúng trôi khỏi nhau ở lần sửa đầu tiên.
   */
  multiline?: boolean;
  /** Số dòng hiện lúc chưa gõ. Chỉ có tác dụng cùng `multiline`. */
  rows?: number;
  /**
   * Trần ký tự. Hiện luôn bộ đếm ở góc phải chú thích khi vượt quá 60% — nói trước còn hơn để
   * người dùng gõ xong mới phát hiện bị cắt.
   */
  maxLength?: number;
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
  hint,
  required = false,
  secureTextEntry,
  multiline = false,
  rows = 4,
  maxLength,
  ...inputProps
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  /*
   * Style của `TextInput` dựng một lần cho mỗi hình dạng ô, không phải mỗi ký tự gõ.
   *
   * `useController` render lại component sau từng phím; một object style mới mỗi lần là một lần
   * `TextInput` nhận prop mới và phải so lại toàn bộ.
   */
  const inputStyle = useMemo(
    () => ({
      flex: 1,
      color: colors.text,
      fontSize: fontSize.body,
      minHeight: multiline ? rows * LINE_HEIGHT : sizing.touchTarget,
      paddingVertical: multiline ? space.sm : 0,
    }),
    [multiline, rows],
  );
  const error = fieldState.error?.message;

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      {/*
        `onPress` chuyển focus TƯỜNG MINH vào ô của khung này. Chạm vào đệm/icon/khoảng trống
        không trúng `TextInput`, và Android khi đó trao focus cho ô focusable KẾ TIẾP — chạm
        "Email hoặc số điện thoại" lại mở bàn phím ở "Mật khẩu".

        CỐ Ý không gắn bóng động vào khung: đổi `style` theo state trên component tamagui làm nó
        dựng lại cây con, mà `TextInput` nằm trong đó — focus mất ngay khi vừa chạm.
      */}
      <FieldShell
        focused={focused}
        invalid={Boolean(error)}
        align={multiline ? 'flex-start' : 'center'}
        onPress={() => inputRef.current?.focus()}
      >
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} /> : null}

        <TextInput
          ref={inputRef}
          value={String(field.value ?? '')}
          onChangeText={field.onChange}
          onBlur={() => {
            setFocused(false);
            field.onBlur();
          }}
          onFocus={() => setFocused(true)}
          secureTextEntry={secureTextEntry && !revealed}
          multiline={multiline}
          {...(maxLength === undefined ? {} : { maxLength })}
          textAlignVertical={multiline ? 'top' : 'center'}
          placeholderTextColor={colors.placeholder}
          style={inputStyle}
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
              size={iconSize.sm}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </FieldShell>

      <FieldMessage error={error} hint={hint} />

      {maxLength !== undefined && String(field.value ?? '').length > maxLength * COUNTER_AT ? (
        <Text col={colors.textMuted} fos={fontSize.label} ta="right">
          {String(field.value ?? '').length}/{maxLength}
        </Text>
      ) : null}
    </YStack>
  );
}
