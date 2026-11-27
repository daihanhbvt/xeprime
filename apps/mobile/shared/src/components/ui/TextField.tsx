import { sanitizePhoneInput } from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Pressable, TextInput, type TextInputProps } from 'react-native';
import { useRevealOnFocus } from '@/components/layout/focus-reveal';
import { Text, YStack } from 'tamagui';
import { FIELD_V2, FieldLabel, FieldMessage, FieldShell, useFieldAppearance, inLabelHint, belowHint } from './Field';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, iconSize, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';

/**
 * Ô `v2` vẽ icon bằng bộ nét Figma (`LineIcon`), không bằng Ionicons: "Profile 1" · "Lock 3" ·
 * "Show" · "Message 36" · "Calling 1" của Figma Partner-XePrime ("Login" `24464:24574`, "Signup -
 * Personal" `24464:24953`). Tên chưa có bản Figma thì giữ Ionicons.
 */
const V2_LINE_ICON: Partial<Record<IconName, LineIconName>> = {
  'person-outline': 'profile',
  'lock-closed-outline': 'lock',
  'mail-outline': 'mail',
  'call-outline': 'calling',
  // Tấm tài khoản nhận tiền (Figma `24228:102978` Scan 5 · `24228:102979` Text).
  'scan-outline': 'scan-5',
  'text-outline': 'text-type',
};

/** Chiều cao một dòng của ô nhiều dòng — cùng nhịp dòng 1.5 mà Tamagui dùng cho chữ trong ô. */
const LINE_HEIGHT = Math.round(fieldFontSize.value * 1.5);

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  icon?: IconName;
  /** Ô `v2`: icon nét Figma đè lên bản suy từ `icon` (vd 'lock-1' của trang Tài khoản và bảo mật). */
  lineIcon?: LineIconName;
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
  /** Ép chú thích lên nhãn dạng ⓘ dù ngắn (mặc định chỉ chú thích dài mới lên nhãn). */
  hintInLabel?: boolean;
  /**
   * Hiện dấu `*` sau nhãn. THUẦN hiển thị — ràng buộc thật nằm ở schema yup của form và ở
   * DTO backend; đánh dấu ở đây mà quên ở schema thì ô vẫn gửi rỗng được.
   */
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
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
  /** Cao ĐÚNG `rows` dòng, nội dung dài hơn thì cuộn trong ô (ô ghi chú: 3 dòng). Cần `multiline`. */
  scrollable?: boolean;
  /**
   * Trần ký tự. Hiện luôn bộ đếm ở góc phải chú thích khi vượt quá 60% — nói trước còn hơn để
   * người dùng gõ xong mới phát hiện bị cắt.
   */
  maxLength?: number;
  /**
   * Không vẽ nhãn phía trên ô — chỉ giữ `label` làm tên cho trình đọc màn hình. Dùng khi web để ô
   * không nhãn nhìn thấy (`aria-label`), vd ô nhận xét của thẻ đánh giá chuyến.
   */
  hideLabel?: boolean;
  editable?: boolean;
  /** Mở bàn phím ngay khi ô được dựng — vd ô vừa được mở khoá bằng nút bút (`key` mới). */
  autoFocus?: boolean;
  /** Phần tử ở mép phải TRONG khung ô — vd nút bút mở khoá ô liên hệ (cùng `suffix` của web). */
  suffix?: ReactNode;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  /**
   * Chạy THÊM mỗi lần chữ đổi, SAU khi `field.onChange` đã ghi vào form.
   *
   * Khai riêng (không đi qua `...inputProps`/`TextInputProps`) vì `onChangeText` của
   * `TextInput` đã bị component này chiếm để nối vào RHF — một bản thứ hai đến từ nơi gọi sẽ
   * ghi đè bản đó thay vì cộng thêm. Dùng khi nơi gọi cần biết "người dùng vừa TỰ gõ", không chỉ
   * "giá trị vừa đổi" (giá trị đổi còn do `setValue` lập trình gây ra) — ví dụ
   * `ConfirmedPlaceField` cần phân biệt hai nguồn đó để quyết định có tự phong một giá trị là
   * "đã xác nhận" hay không.
   */
  onChangeText?: (text: string) => void;
  /** Content attached below the input control and above its hint/error, e.g. an autocomplete menu. */
  afterControl?: ReactNode;
  /**
   * Chạy THÊM khi rời ô, SAU khi `field.onBlur()` đã chạy. Cùng lý do tách riêng với
   * `onChangeText` ở trên — bản nội bộ của `onBlur` còn phải tắt viền focus.
   */
  onBlur?: () => void;
  /** Runs after the field receives focus. */
  onFocus?: () => void;
}

/** Form state ở React Hook Form, không Redux (ADR 0004). */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  icon,
  lineIcon,
  hint,
  hintInLabel = false,
  required = false,
  publishRequired = false,
  secureTextEntry,
  multiline = false,
  rows = 4,
  scrollable = false,
  maxLength,
  hideLabel = false,
  onChangeText: onChangeTextExtra,
  onBlur: onBlurExtra,
  onFocus: onFocusExtra,
  afterControl,
  suffix,
  ...inputProps
}: TextFieldProps<T>) {
  const colors = useColors();
  /*
   * `editable={false}` là cách React Native khai "chỉ đọc"; vỏ ô cần biết để đổi hình.
   *
   * Chỉ VỎ đổi — nền chìm và viền nhạt của `FieldShell`. Giá trị bên trong giữ nguyên màu chữ
   * chính: nó là DỮ LIỆU của người dùng, và làm mờ nó là làm mờ đúng thứ họ mở màn ra để đọc.
   * Trên một hồ sơ khoá toàn phần (gian hàng đang chờ duyệt, hoặc tài khoản không có
   * `tenant.update`) thì mười mấy ô cùng mờ cả khung lẫn chữ đọc ra như màn hình hỏng, không
   * ra "đang chờ duyệt nên tạm khoá" — mà câu giải thích thì đã nằm ở `Callout` đầu trang rồi.
   *
   * Đây cũng là cách MỌI ô khác trong bộ đang làm (`TextControl`, `DateField`, `FieldBox`):
   * chỉ ô này lệch, nên form nào nhiều `TextField` thì xám hơn hẳn form bên cạnh.
   */
  const readOnly = inputProps.editable === false;
  /** Bộ ô `v2` (Figma Partner-XePrime) — xem `FieldAppearance`. */
  const v2 = useFieldAppearance() === 'v2';
  const { field, fieldState } = useController({ control, name });
  const inputRef = useRef<TextInput>(null);
  const revealOnFocus = useRevealOnFocus();
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
      fontSize: v2 ? FIELD_V2.valueFontSize : fieldFontSize.value,
      fontFamily: FONT_FAMILY.body,
      minHeight: multiline ? rows * LINE_HEIGHT : v2 ? FIELD_V2.height - 2 : sizing.touchTarget,
      paddingVertical: multiline ? space.sm : 0,
      // Android tự đệm ~4dp hai bên TextInput: chữ gõ lệch khỏi chữ ô chọn/ngày cùng form.
      paddingHorizontal: 0,
      ...(multiline && scrollable ? { maxHeight: rows * LINE_HEIGHT + space.sm * 2 } : {}),
    }),
    [colors, multiline, rows, scrollable, v2],
  );
  const error = fieldState.error?.message;

  return (
    <YStack gap={v2 ? FIELD_V2.labelGap : space.xs}>
      {hideLabel ? null : (
        <FieldLabel label={label} required={required} publishRequired={publishRequired} hint={inLabelHint(hint, hintInLabel)} />
      )}

      {/*
        `onPress` chuyển focus TƯỜNG MINH vào ô của khung này. Chạm vào đệm/icon/khoảng trống
        không trúng `TextInput`, và Android khi đó trao focus cho ô focusable KẾ TIẾP — chạm
        "Email hoặc số điện thoại" lại mở bàn phím ở "Mật khẩu".

        CỐ Ý không gắn bóng động vào khung: đổi `style` theo state trên component tamagui làm nó
        dựng lại cây con, mà `TextInput` nằm trong đó — focus mất ngay khi vừa chạm.
      */}
      <FieldShell
        disabled={readOnly}
        focused={focused}
        invalid={Boolean(error)}
        align={multiline ? 'flex-start' : 'center'}
        onPress={() => inputRef.current?.focus()}
      >
        {v2 && lineIcon ? (
          <LineIcon name={lineIcon} size={FIELD_V2.icon} color={colors.placeholder} />
        ) : icon && v2 && V2_LINE_ICON[icon] ? (
          <LineIcon name={V2_LINE_ICON[icon]} size={FIELD_V2.icon} color={colors.placeholder} />
        ) : icon ? (
          <Ionicons
            name={icon}
            size={v2 ? FIELD_V2.icon : iconSize.sm}
            color={v2 ? colors.placeholder : colors.textMuted}
          />
        ) : null}

        <TextInput
          // A11Y-LABEL: nhãn nằm ở `FieldLabel` BÊN CẠNH ô, không nằm trong ô — trình đọc
          // màn hình vì thế đọc ra một ô nhập vô danh. Gắn tên ô vào chính input là chỗ duy
          // nhất sửa được cho cả app (và là cách test tìm đúng ô, thay vì dò placeholder).
          accessibilityLabel={label}
          ref={inputRef}
          value={String(field.value ?? '')}
          onChangeText={(raw) => {
            // Ô SĐT (ADR 0082): chỉ giữ chữ số và một `+` đầu, lúc gõ lẫn lúc dán.
            const text = inputProps.keyboardType === 'phone-pad' ? sanitizePhoneInput(raw) : raw;
            field.onChange(text);
            onChangeTextExtra?.(text);
          }}
          onBlur={() => {
            setFocused(false);
            field.onBlur();
            onBlurExtra?.();
          }}
          onFocus={() => {
            setFocused(true);
            revealOnFocus();
            onFocusExtra?.();
          }}
          secureTextEntry={secureTextEntry && !revealed}
          multiline={multiline}
          {...(multiline && scrollable ? { scrollEnabled: true } : {})}
          {...(maxLength === undefined ? {} : { maxLength })}
          textAlignVertical={multiline ? 'top' : 'center'}
          placeholderTextColor={v2 ? colors.textPlaceholder : colors.placeholder}
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
            {v2 ? (
              <LineIcon
                name={revealed ? 'eye-hide' : 'eye'}
                size={FIELD_V2.icon}
                color={colors.placeholder}
              />
            ) : (
              <Ionicons
                name={revealed ? 'eye-off-outline' : 'eye-outline'}
                size={iconSize.sm}
                color={colors.textMuted}
              />
            )}
          </Pressable>
        ) : null}
        {suffix}
      </FieldShell>

      {afterControl}

      <FieldMessage error={error} hint={belowHint(hint, hintInLabel)} />

      {/*
        Có `maxLength` là có bộ đếm, ngay từ ký tự đầu — đúng `showCount` của `<TextArea>` bên
        web. Bản cũ giấu nó tới khi dùng quá 60% trần: người dùng gõ một đoạn dài mà không hề
        biết có giới hạn, rồi bị chặn ở đâu đó giữa chừng không rõ vì sao.
      */}
      {maxLength !== undefined ? (
        <Text col={colors.textMuted} fos={fieldFontSize.affix} ta="right">
          {String(field.value ?? '').length}/{maxLength}
        </Text>
      ) : null}
    </YStack>
  );
}
