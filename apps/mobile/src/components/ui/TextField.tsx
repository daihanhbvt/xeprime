import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, TextInput, type TextInputProps } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';

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
  ...inputProps
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const error = fieldState.error?.message;

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <YStack gap={space.xs}>
      {/*
        Nhãn giữ nguyên dạng của chuỗi dịch — đừng `toUpperCase` ở tầng component: tiếng Việt
        viết hoa hết thì dấu thanh chồng lên nhau ở cỡ chữ nhỏ.
      */}
      <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {label}
        {/* Lồng trong cùng `Text` để dấu sao xuống dòng cùng nhãn, không ở lại dòng trên. */}
        {required ? <Text col={colors.danger}> *</Text> : null}
      </Text>

      {/*
        `onPress` chuyển focus TƯỜNG MINH vào ô của khung này. Chạm vào đệm/icon/khoảng trống
        không trúng `TextInput`, và Android khi đó trao focus cho ô focusable KẾ TIẾP — chạm
        "Email hoặc số điện thoại" lại mở bàn phím ở "Mật khẩu".

        CỐ Ý không gắn bóng động vào khung: đổi `style` theo state trên component tamagui làm nó
        dựng lại cây con, mà `TextInput` nằm trong đó — focus mất ngay khi vừa chạm.
      */}
      {/*
        Nền xám nhạt, KHÔNG viền lúc nghỉ — viền chỉ xuất hiện khi focus hoặc lỗi.
        
        Một đường viền quanh mọi ô là thứ làm form trông nặng: bốn ô xếp dọc thành bốn khung
        đóng. Bỏ nó đi thì ô vẫn tách khỏi trang nhờ nền, mà bớt hẳn một lớp nét — và lúc focus,
        viền gold xuất hiện từ chỗ trống nên đọc rõ hơn hẳn so với việc đổi màu một viền có sẵn.

        Chiều cao GIỮ `sizing.touchTarget`: đó là sàn chạm 48dp của Android (xem `theme/tokens`).
        Ô thấp hơn trông thon hơn trên máy thiết kế và khó bấm hơn trên tay.
      */}
      <XStack
        ai="center"
        gap={space.sm}
        bg={colors.surfaceMuted}
        br={radius.sm}
        bw={1}
        bc={focused || error ? borderColor : 'transparent'}
        px={space.sm}
        minHeight={sizing.touchTarget}
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
              size={iconSize.sm}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </XStack>

      {error ? (
        <XStack ai="center" gap={space.xs}>
          <Ionicons name="alert-circle" size={iconSize.xs} color={colors.danger} />
          <Text col={colors.danger} fos={fontSize.bodySm}>
            {error}
          </Text>
        </XStack>
      ) : hint ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}
