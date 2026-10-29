import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput } from 'react-native';
import { XStack } from 'tamagui';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontSize, iconSize, radius, sizing, space } from '@/theme/tokens';

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
  onSubmit,
  onFocus,
  onBlur,
  maxLength,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder: string;
  /**
   * `bare` — dòng từ khoá NẰM TRONG khung tìm kiếm hai dòng của trang kết quả (Figma "List - MB"
   * `20043:57771`): không nền, không viền, không đệm ngang; kính lúp màu `primary`.
   */
  variant?: 'pill' | 'boxed' | 'bare';
  /** Phím "Tìm" trên bàn phím — áp ngay, không đợi nhịp trì hoãn. */
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  maxLength?: number;
}) {
  const colors = useColors();
  const inputRef = useRef<TextInput>(null);
  const boxed = variant === 'boxed';
  const bare = variant === 'bare';

  return (
    <XStack
      ai="center"
      gap={bare ? 6 : space.sm}
      // Trắng ở biến thể có khung: ô tìm kiếm cũng là ô nhập, cùng ngôn ngữ với `FieldShell`.
      bg={bare ? 'transparent' : colors.surface}
      // Viền nghỉ `color-border` như `FieldShell` — đúng `colorBorder` của `<Input>` AntD bên web.
      bw={bare ? 0 : 1}
      bc={colors.border}
      // `boxed` = khuôn ô tìm chung của app (28/10/2026): bo 12 như nút, đệm 12 — cùng ô tìm màn Tìm xe.
      br={boxed ? radius.control : radius.pill}
      px={bare ? 0 : 12}
      // `bare`: dòng 22 của Figma `20043:57777` — không chừa thêm khoảng nào.
      minHeight={bare ? 22 : sizing.touchTarget}
      // Chạm vào đệm/icon không trúng `TextInput`; Android khi đó trao focus cho ô kế tiếp.
      onPress={() => inputRef.current?.focus()}
    >
      <Ionicons
        name="search-outline"
        size={iconSize.sm}
        color={bare || boxed ? colors.primary : colors.textMuted}
      />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={label}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        onBlur={onBlur}
        maxLength={maxLength}
        /*
         * `fontFamily` PHẢI khai tường minh: `TextInput` của React Native không thừa kế font từ
         * Tamagui và không có font kế thừa như CSS. Bỏ trống thì ô tìm kiếm chạy font hệ điều
         * hành trong khi mọi chữ quanh nó là Be Vietnam Pro.
         */
        style={{
          flex: 1,
          color: colors.text,
          fontFamily: FONT_FAMILY.body,
          // `bare` (khung tìm kiếm trang kết quả, Figma `20043:57779`): 14/22 — cỡ chung 12 của ô nhập lọt thỏm giữa chữ 14 xung quanh.
          fontSize: bare ? fontSize.body : fieldFontSize.value,
          // Android tự đệm dọc `TextInput` (~8dp mỗi phía) — chính khoảng thừa làm khung `bare` dày ra.
          ...(bare ? { paddingVertical: 0, height: 22 } : null),
        }}
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
