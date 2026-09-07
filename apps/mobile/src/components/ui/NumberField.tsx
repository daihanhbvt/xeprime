import { useRef, useState } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { TextInput } from 'react-native';
import { Text, YStack } from 'tamagui';
import { formatNumberInput, normalizeNumberInput, parseNumberInput } from '@xeprime/domain';
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
 * Ô nhập SỐ ĐO — số chỗ, đời xe, phần trăm, kích thước, khối lượng, số KM, mức tiêu thụ.
 *
 * Tách khỏi `MoneyField` vì hai thứ khác nhau ở chỗ quan trọng nhất: tiền luôn là số nguyên và
 * luôn ngăn nhóm nghìn, còn số đo thì có loại thập phân (`2,8` L/100km) và có loại không được
 * ngăn nhóm (`2019`, không phải `2.019`).
 *
 * Giá trị trong form là `number | null`. `null` = **chưa nhập**, khác `0` = **bằng không**:
 * `PATCH` chỉ đổi trường có mặt, nên xoá trắng một ô không được biến thành số không.
 *
 * `suffix` là TRANG TRÍ của ô (mm, kg, %, km) — nó không nằm trong giá trị gửi đi.
 *
 * **Nhận SỐ THẬP PHÂN theo mặc định.** Bản đầu lọc `text.replace(/\D/g, '')` cho mọi ô, tức gõ
 * `2.8` (L/100km) ra `28` — không phải chặn ký tự, mà là ÂM THẦM nhân giá trị lên mười lần. Web
 * dùng `<InputNumber>` của AntD và chỉ ép số nguyên ở ô phần trăm (`precision={0}`), nên mặc
 * định ở đây phải là cho phép, còn `integer` là thứ nơi gọi bật lên.
 *
 * **Có ngăn nhóm nghìn, khác web** (`12.500`) — quyết định của người dùng 03/09/2026. Web để
 * trần vì `<InputNumber>` mặc định không format; ở màn hình hẹp, một chuỗi bảy chữ số không dấu
 * ngăn là thứ phải đếm bằng mắt mới biết là mười ngàn hay một trăm ngàn.
 *
 * `percent` là dạng rút gọn — đúng shorthand `percent` của `apps/web/src/components/form/
 * NumberField.tsx`: tự kẹp `min=0`/`max=100`, tự thêm hậu tố `%`, và tự nguyên hoá (chặn thập
 * phân) TRỪ KHI gọi kèm `precision` tường minh (ca duy nhất: lãi suất `precision={2}`, vẫn
 * kẹp 0–100 nhưng vẫn gõ được số lẻ). Không có shorthand này, mỗi màn tự gõ lại `min={0}
 * max={100}` — dễ quên, và thiếu nó thì gõ "500" vào ô % không hề bị kẹp lại như web.
 */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  suffix,
  placeholder,
  min,
  max,
  precision,
  required = false,
  editable = true,
  integer = false,
  grouped = true,
  percent = false,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  suffix?: string;
  placeholder?: string;
  /** Chặn dưới/chặn trên — KẸP lúc rời ô, đúng `min`/`max` của `<InputNumber>` bên web. */
  min?: number;
  max?: number;
  /** Số chữ số thập phân giữ lại khi rời ô. `integer` là dạng rút gọn của `precision={0}`. */
  precision?: number;
  required?: boolean;
  editable?: boolean;
  /** Chỉ nhận số nguyên — dùng cho ô phần trăm, đúng `precision={0}` của web. */
  integer?: boolean;
  /** Tắt dấu ngăn nhóm nghìn. Năm sản xuất phải đọc là `2019`, không phải `2.019`. */
  grouped?: boolean;
  /** Ô phần trăm: tự `min=0`, `max=100`, hậu tố `%`; tự nguyên hoá trừ khi có `precision`. */
  percent?: boolean;
}) {
  const effectiveMin = min ?? (percent ? 0 : undefined);
  const effectiveMax = max ?? (percent ? 100 : undefined);
  const effectiveSuffix = suffix ?? (percent ? '%' : undefined);
  const effectiveInteger = integer || (percent && precision == null);

  const { field, fieldState } = useController({ control, name });
  const inputRef = useRef<TextInput>(null);
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

  const error = fieldState.error?.message;
  const value = field.value as number | null | undefined;

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
          value={focused && draft != null ? draft : formatNumberInput(value, { grouped })}
          onChangeText={(text) => {
            const cleaned = normalizeNumberInput(text, { integer: effectiveInteger });
            setDraft(cleaned);
            field.onChange(parseNumberInput(cleaned));
          }}
          onBlur={() => {
            setFocused(false);
            setDraft(null);
            /*
             * Kẹp lúc RỜI ô, không phải theo từng phím — đúng mốc `<InputNumber>` bên web kẹp:
             * gõ 45 vào "ngày đến hạn" thì rời ô ra 31. Kẹp theo phím thì ô `min={1}` nuốt mất
             * số 0 vừa gõ và không ai gõ nổi "05".
             */
            const clamped = clampOnCommit(field.value as number | null | undefined, {
              min: effectiveMin,
              max: effectiveMax,
              precision: effectiveInteger ? 0 : precision,
            });
            if (clamped !== field.value) field.onChange(clamped);
            field.onBlur();
          }}
          onFocus={() => setFocused(true)}
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
function clampOnCommit(
  value: number | null | undefined,
  bounds: { min?: number; max?: number; precision?: number },
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
