import { useRef } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { LineIcon } from '@/components/icons/LineIcon';
import {
  fieldFontSize,
  fontSize,
  iconSize,
  radius,
  sizing,
  space,
  typeScale,
} from '@/theme/tokens';
import { elevation } from '@/theme/elevation';

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
  /**
   * `field` — ô tìm của design v2 (Figma "Input - Select" `24175:57179`, màn Đơn thuê xe): cao 40,
   * viền `stroke/gray-low300`, bo 12, đệm 14, icon "Search 1" 20 xám, chữ 14/20, bóng xs.
   */
  variant?: 'pill' | 'boxed' | 'bare' | 'field';
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
  const field = variant === 'field';

  return (
    <XStack
      ai="center"
      gap={bare ? 6 : space.sm}
      // Trắng ở biến thể có khung: ô tìm kiếm cũng là ô nhập, cùng ngôn ngữ với `FieldShell`.
      bg={bare ? 'transparent' : colors.surface}
      // Viền nghỉ `color-border` như `FieldShell` — đúng `colorBorder` của `<Input>` AntD bên web.
      bw={bare ? 0 : 1}
      bc={field ? colors.borderInput : colors.border}
      // `boxed` = khuôn ô tìm chung của app (28/10/2026): bo 12 như nút, đệm 12 — cùng ô tìm màn Tìm xe.
      br={boxed || field ? radius.control : radius.pill}
      px={bare ? 0 : field ? FIELD_PAD_X : 12}
      // `bare`: dòng 22 của Figma `20043:57777` — không chừa thêm khoảng nào.
      minHeight={bare ? 22 : field ? FIELD_MIN_HEIGHT : sizing.touchTarget}
      {...(field ? { style: elevation.xs } : {})}
      // Chạm vào đệm/icon không trúng `TextInput`; Android khi đó trao focus cho ô kế tiếp.
      onPress={() => inputRef.current?.focus()}
    >
      {/* Figma "Search 2" - cùng nét icon tìm kiếm của trang kết quả. */}
      {field ? (
        <LineIcon name="search" size={iconSize.lg} color={colors.placeholder} />
      ) : (
        <LineIcon
          name="search-2"
          size={iconSize.sm}
          color={bare || boxed ? colors.primary : colors.textMuted}
        />
      )}
      {/*
        Chữ gợi ý tự vẽ thay `placeholder` gốc: `TextInput` không cắt placeholder bằng "..." - chữ dài
        bị cụt ngang giữa từ ("tê"). `Text numberOfLines={1}` cắt đuôi đúng chuẩn (người dùng 13/11/2026).
      */}
      <YStack f={1} jc="center" minWidth={0}>
        {value ? null : (
          <YStack style={StyleSheet.absoluteFill} jc="center" pointerEvents="none">
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              col={colors.placeholder}
              fontFamily={FONT_FAMILY.body}
              fos={bare ? fontSize.body : field ? typeScale.body.fontSize : fieldFontSize.value}
            >
              {placeholder}
            </Text>
          </YStack>
        )}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          accessibilityLabel={label}
          accessibilityHint={placeholder}
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
            alignSelf: 'stretch',
            color: colors.text,
            fontFamily: FONT_FAMILY.body,
            // `bare` (khung tìm kiếm trang kết quả, Figma `20043:57779`): 14/22 — cỡ chung 12 của ô nhập lọt thỏm giữa chữ 14 xung quanh.
            fontSize: bare ? fontSize.body : field ? typeScale.body.fontSize : fieldFontSize.value,
            // Android tự đệm dọc `TextInput` (~8dp mỗi phía) — chính khoảng thừa làm khung `bare` dày ra.
            ...(bare ? { paddingVertical: 0, height: 22 } : null),
            // `field`: ô cao 40 cố định - bỏ đệm dọc mặc định của Android để chữ nằm giữa ô.
            ...(field ? { paddingVertical: 0 } : null),
            // Chữ gợi ý tự vẽ nằm đúng chỗ chữ gõ: bỏ đệm ngang mặc định của Android.
            paddingHorizontal: 0,
          }}
        />
      </YStack>
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

/** Figma "Input" v2: cao tối thiểu 40, đệm ngang 14. */
const FIELD_MIN_HEIGHT = 40;
const FIELD_PAD_X = 14;
