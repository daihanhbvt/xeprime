import { useRef, useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { TextInput } from 'react-native';
import { Text, YStack } from 'tamagui';
import { CURRENCY_SUFFIX, formatMoneyInput, parseMoneyInput } from '@xeprime/domain';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { colors, fieldFontSize, fontWeight, sizing, space } from '@/theme/tokens';

/** Không phụ thuộc prop/state nào — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const INPUT_STYLE = {
  flex: 1,
  color: colors.text,
  fontSize: fieldFontSize.value,
  minHeight: sizing.touchTarget,
  paddingVertical: 0,
} as const;

/**
 * Ô nhập TIỀN — bản native của `MoneyInput` bên web.
 *
 * Giá trị trong form là `number | null`, không phải chuỗi đã format: chuỗi chỉ tồn tại trên màn
 * hình, còn feature vẫn hoá nó thành chuỗi số khi gửi API (ADR 0007). Không quy đổi đơn vị —
 * gõ 350000 thì payload là 350000.
 *
 * `null` = **chưa nhập**, khác hẳn `0` = **miễn phí**. `PATCH` chỉ đổi trường có mặt, nên xoá
 * trắng một ô tiền phải để nguyên giá trị cũ trên server chứ không đặt nó về không.
 *
 * Định dạng và bóc số dùng chung với web qua `@xeprime/domain`: cả hai chỉ giữ CHỮ SỐ, nên gõ
 * chèn giữa chuỗi, dán một giá trị đã có dấu chấm, hay bấm nhầm dấu phẩy đều quy về cùng kết
 * quả — và bàn phím `number-pad` của iOS có phím dấu phẩy nên chuyện đó xảy ra thật.
 */
export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
  required = false,
  editable = true,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  editable?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const error = fieldState.error?.message;

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      <FieldShell
        focused={focused}
        invalid={Boolean(error)}
        align="center"
        onPress={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          value={formatMoneyInput(field.value as number | null)}
          onChangeText={(text) => field.onChange(parseMoneyInput(text))}
          onBlur={() => {
            setFocused(false);
            field.onBlur();
          }}
          onFocus={() => setFocused(true)}
          editable={editable}
          keyboardType="number-pad"
          {...(placeholder === undefined ? {} : { placeholder })}
          placeholderTextColor={colors.placeholder}
          style={INPUT_STYLE}
        />

        {/* Đơn vị là TRANG TRÍ của ô, không nằm trong giá trị — đúng vai `suffix` bên web. */}
        <Text col={colors.textMuted} fos={fieldFontSize.affix} fow={fontWeight.medium}>
          {CURRENCY_SUFFIX}
        </Text>
      </FieldShell>

      <FieldMessage error={error} hint={hint} />
    </YStack>
  );
}
