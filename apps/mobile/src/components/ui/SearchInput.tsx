import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput } from 'react-native';
import { XStack } from 'tamagui';
import { colors, fontSize, iconSize, radius, sizing, space } from '@/theme/tokens';

/**
 * Ô tìm kiếm KHÔNG gắn form — cho những danh sách lọc ở server.
 *
 * Tách khỏi `TextField` vì `TextField` buộc phải có `control` của react-hook-form: một ô tìm
 * kiếm không phải một form, và dựng `useForm` cho nó là thêm một máy trạng thái cho một chuỗi.
 *
 * Nơi gọi tự lo phần trì hoãn (`useDebouncedValue`) — gõ một ký tự là một request thì danh sách
 * nháy liên tục và server nhận mười lần đọc cho một lần tìm.
 */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  variant = 'pill',
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  variant?: 'pill' | 'boxed';
}) {
  const inputRef = useRef<TextInput>(null);
  const boxed = variant === 'boxed';

  return (
    <XStack
      ai="center"
      gap={space.sm}
      bg={boxed ? colors.surface : colors.surfaceMuted}
      // Viền nghỉ vì cùng lý do với `TextField`: nền xám nhạt biến mất trên thẻ trắng.
      bw={1}
      bc={colors.borderInput}
      br={boxed ? radius.md : radius.pill}
      px={boxed ? space.sm : space.md}
      minHeight={sizing.touchTarget}
      // Chạm vào đệm/icon không trúng `TextInput`; Android khi đó trao focus cho ô kế tiếp.
      onPress={() => inputRef.current?.focus()}
    >
      <Ionicons name="search-outline" size={iconSize.sm} color={colors.textMuted} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={label}
        returnKeyType="search"
        style={{ flex: 1, color: colors.text, fontSize: fontSize.body }}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={space.sm}
        >
          <Ionicons name="close-circle" size={iconSize.md} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </XStack>
  );
}
