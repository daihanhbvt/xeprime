import { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { Text, YStack } from 'tamagui';
import { CURRENCY_SUFFIX, formatMoneyInput, parseMoneyInput } from '@xeprime/domain';
import { useRevealOnFocus } from '@/components/layout/focus-reveal';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { FONT_FAMILY } from '@/theme/fonts';
import { colors, fieldFontSize, fontWeight, sizing, space } from '@/theme/tokens';

/** Không phụ thuộc prop/state nào — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const INPUT_STYLE = {
  flex: 1,
  color: colors.text,
  fontSize: fieldFontSize.value,
  fontFamily: FONT_FAMILY.body,
  minHeight: sizing.touchTarget,
  paddingVertical: 0,
} as const;

/**
 * Ô nhập TIỀN, bản KHÔNG gắn với React Hook Form.
 *
 * Tách khỏi [`MoneyField`](./MoneyField.tsx) đúng theo cặp `NumberControl`/`NumberField`: file này
 * là HÌNH DẠNG + hành vi gõ, file kia chỉ nối nó vào RHF. Có những khoản tiền sống ở state màn
 * chứ không ở form — số tiền cần rút trong `WithdrawSheet` chẳng hạn, nơi cả sheet là MỘT thao
 * tác chứ không phải một biểu mẫu có nút Lưu. Trước khi tách, những chỗ đó dựng `TextControl` trần
 * và tự lọc chữ số, nên chúng mất đúng thứ quan trọng nhất của một ô tiền: **dấu ngăn nhóm nghìn**.
 * Một ô rút tiền hiện `2000000` là ô mà người dùng phải đếm số 0 bằng mắt, và đếm nhầm một chữ số
 * ở đây là một lệnh chuyển sai gấp mười lần.
 *
 * Toàn bộ docblock về `null` ≠ `0` và về việc dùng chung `formatMoneyInput`/`parseMoneyInput` với
 * web nằm ở `MoneyField`.
 */
export function MoneyControl({
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  placeholder,
  unit,
  required = false,
  publishRequired = false,
  editable = true,
}: {
  label: string;
  /** `null` = **chưa nhập**, khác `0` = **miễn phí**. */
  value: number | null;
  onChange: (next: number | null) => void;
  onBlur?: () => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  /** Đơn vị ĐẦY ĐỦ thay cho mỗi ký hiệu tiền — "đ / ngày", "đ / giờ", "đ / tháng". */
  unit?: string;
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
  required?: boolean;
  editable?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const revealOnFocus = useRevealOnFocus();
  const [focused, setFocused] = useState(false);

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} publishRequired={publishRequired} />

      <FieldShell
        focused={focused}
        invalid={Boolean(error)}
        align="center"
        onPress={() => inputRef.current?.focus()}
      >
        <TextInput
          // A11Y-LABEL: nhãn nằm ở `FieldLabel` BÊN CẠNH ô, không nằm trong ô — trình đọc
          // màn hình vì thế đọc ra một ô nhập vô danh. Gắn tên ô vào chính input là chỗ duy
          // nhất sửa được cho cả app (và là cách test tìm đúng ô, thay vì dò placeholder).
          accessibilityLabel={label}
          ref={inputRef}
          value={formatMoneyInput(value)}
          onChangeText={(text) => onChange(parseMoneyInput(text))}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onFocus={() => {
            setFocused(true);
            revealOnFocus();
          }}
          editable={editable}
          keyboardType="number-pad"
          {...(placeholder === undefined ? {} : { placeholder })}
          placeholderTextColor={colors.placeholder}
          style={INPUT_STYLE}
        />

        {/* Đơn vị là TRANG TRÍ của ô, không nằm trong giá trị — đúng vai `suffix` bên web. */}
        <Text col={colors.textMuted} fos={fieldFontSize.affix} fow={fontWeight.medium}>
          {unit ?? CURRENCY_SUFFIX}
        </Text>
      </FieldShell>

      <FieldMessage error={error} hint={hint} />
    </YStack>
  );
}
