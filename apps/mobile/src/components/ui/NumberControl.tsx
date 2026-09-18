import { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { Text, YStack } from 'tamagui';
import { formatNumberInput, normalizeNumberInput, parseNumberInput } from '@xeprime/domain';
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

export interface NumberControlBounds {
  /** Chặn dưới/chặn trên — KẸP lúc rời ô, đúng mốc `<InputNumber>` bên web kẹp. */
  min?: number;
  max?: number;
  /** Số chữ số thập phân giữ lại khi rời ô. `integer` là dạng rút gọn của `precision={0}`. */
  precision?: number;
}

/**
 * Ô nhập SỐ ĐO, bản KHÔNG gắn với React Hook Form.
 *
 * Tách khỏi [`NumberField`](./NumberField.tsx) đúng theo cặp `SelectControl`/`SelectField`: file
 * này là HÌNH DẠNG + hành vi gõ/kẹp, file kia chỉ nối nó vào RHF. Có những con số sống ở state
 * component chứ không ở form — số chỗ xe trong bộ chọn mua gói, nơi cùng một state còn quyết định
 * cả bảng giá kỳ hạn (`usePlanPurchase`) — và trước khi tách, chúng phải dựng một form giả chỉ để
 * mượn được ô này.
 *
 * Toàn bộ docblock về thập phân, ngăn nhóm nghìn và `percent` nằm ở `NumberField`.
 */
export function NumberControl({
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  suffix,
  placeholder,
  min,
  max,
  precision,
  required = false,
  publishRequired = false,
  editable = true,
  integer = false,
  grouped = true,
  percent = false,
}: {
  label: string;
  /** `null` = **chưa nhập**, khác `0` = **bằng không**. */
  value: number | null;
  onChange: (next: number | null) => void;
  /** Ô đã rời — nơi gọi dùng để đánh dấu `touched` (RHF). Chạy SAU lượt kẹp giá trị. */
  onBlur?: () => void;
  hint?: string;
  error?: string;
  suffix?: string;
  placeholder?: string;
  required?: boolean;
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
  editable?: boolean;
  integer?: boolean;
  grouped?: boolean;
  percent?: boolean;
} & NumberControlBounds) {
  const effectiveMin = min ?? (percent ? 0 : undefined);
  const effectiveMax = max ?? (percent ? 100 : undefined);
  const effectiveSuffix = suffix ?? (percent ? '%' : undefined);
  const effectiveInteger = integer || (percent && precision == null);

  const inputRef = useRef<TextInput>(null);
  const revealOnFocus = useRevealOnFocus();
  const [focused, setFocused] = useState(false);
  /*
   * Bản NHÁP của chuỗi đang gõ, chỉ sống trong lúc ô đang được chọn.
   *
   * Không có nó thì mọi ký tự gõ vào đều phải đi qua `Number()` rồi quay lại thành chuỗi, và các
   * trạng thái NỬA CHỪNG hợp lệ biến mất ngay dưới ngón tay: gõ `2,` cho ra `2` → dấu phẩy bay
   * mất và không bao giờ gõ nổi một số thập phân.
   *
   * Nháp cũng là lý do KHÔNG ngăn nhóm trong lúc gõ: chèn dấu vào giữa chuỗi làm con trỏ nhảy về
   * cuối sau mỗi phím. Dấu ngăn xuất hiện khi rời ô, lúc chuỗi đã đứng yên.
   */
  const [draft, setDraft] = useState<string | null>(null);
  /*
   * Giá trị THÔ vừa gõ, để `onBlur` kẹp đúng con số cuối cùng.
   *
   * Không đọc `value` trong `onBlur`: nơi gọi có thể đã NÂNG nó lên mức gồm sẵn trước khi trả
   * xuống (`usePlanPurchase.slots` làm đúng vậy), nên kẹp lại giá trị đã nâng sẽ không bao giờ
   * nhận ra người dùng vừa gõ một số dưới ngưỡng.
   */
  const rawRef = useRef<number | null>(value);

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
          // A11Y-LABEL: nhãn nằm ở `FieldLabel` BÊN CẠNH ô, không nằm trong ô — trình đọc màn
          // hình vì thế đọc ra một ô nhập vô danh. Gắn tên ô vào chính input là chỗ duy nhất sửa
          // được cho cả app (và là cách test tìm đúng ô, thay vì dò placeholder).
          accessibilityLabel={label}
          ref={inputRef}
          value={focused && draft != null ? draft : formatNumberInput(value, { grouped })}
          onChangeText={(text) => {
            const cleaned = normalizeNumberInput(text, { integer: effectiveInteger });
            setDraft(cleaned);
            const parsed = parseNumberInput(cleaned);
            rawRef.current = parsed;
            onChange(parsed);
          }}
          onBlur={() => {
            setFocused(false);
            setDraft(null);
            /*
             * Kẹp lúc RỜI ô, không phải theo từng phím — đúng mốc `<InputNumber>` bên web kẹp:
             * gõ 45 vào "ngày đến hạn" thì rời ô ra 31. Kẹp theo phím thì ô `min={1}` nuốt mất
             * số 0 vừa gõ và không ai gõ nổi "05".
             */
            const clamped = clampOnCommit(rawRef.current, {
              min: effectiveMin,
              max: effectiveMax,
              precision: effectiveInteger ? 0 : precision,
            });
            rawRef.current = clamped;
            if (clamped !== value) onChange(clamped);
            onBlur?.();
          }}
          onFocus={() => {
            setFocused(true);
            rawRef.current = value;
            revealOnFocus();
          }}
          editable={editable}
          /*
            `decimal-pad` mở phím dấu thập phân; `number-pad` thì không có. Ô số nguyên dùng bàn
            phím không có dấu là một lớp chặn ngay tại nguồn, đỡ phải lọc.
          */
          keyboardType={effectiveInteger ? 'number-pad' : 'decimal-pad'}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          style={INPUT_STYLE}
        />

        {effectiveSuffix ? (
          <Text col={colors.textMuted} fos={fieldFontSize.affix} fow={fontWeight.medium}>
            {effectiveSuffix}
          </Text>
        ) : null}
      </FieldShell>

      <FieldMessage error={error} hint={hint} />
    </YStack>
  );
}

/** `null` đi qua nguyên vẹn: chưa nhập không được biến thành `min`. */
export function clampOnCommit(
  value: number | null | undefined,
  bounds: NumberControlBounds,
): number | null {
  if (value == null || Number.isNaN(value)) return null;

  let next = value;
  if (bounds.precision != null) {
    const factor = 10 ** bounds.precision;
    next = Math.round(next * factor) / factor;
  }
  if (bounds.min != null) next = Math.max(next, bounds.min);
  if (bounds.max != null) next = Math.min(next, bounds.max);
  return next;
}
