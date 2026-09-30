import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { NumberControl } from './NumberControl';

/**
 * Ô nhập SỐ ĐO — số chỗ, đời xe, phần trăm, kích thước, khối lượng, số KM, mức tiêu thụ.
 *
 * Toàn bộ hình dạng và hành vi nằm ở [`NumberControl`](./NumberControl.tsx); file này chỉ làm đúng
 * một việc là nối nó vào React Hook Form — cùng cặp `SelectControl`/`SelectField`.
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
  publishRequired = false,
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
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
  required?: boolean;
  editable?: boolean;
  /** Chỉ nhận số nguyên — dùng cho ô phần trăm, đúng `precision={0}` của web. */
  integer?: boolean;
  /** Tắt dấu ngăn nhóm nghìn. Năm sản xuất phải đọc là `2019`, không phải `2.019`. */
  grouped?: boolean;
  /** Ô phần trăm: tự `min=0`, `max=100`, hậu tố `%`; tự nguyên hoá trừ khi có `precision`. */
  percent?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <NumberControl
      label={label}
      value={(field.value as number | null | undefined) ?? null}
      onChange={field.onChange}
      // RHF cần `onBlur` để đánh dấu `touched` — thiếu nó, `mode: 'onTouched'` không chấm ô này.
      onBlur={field.onBlur}
      required={required}
      publishRequired={publishRequired}
      editable={editable}
      integer={integer}
      grouped={grouped}
      percent={percent}
      {...(hint === undefined ? {} : { hint })}
      {...(suffix === undefined ? {} : { suffix })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(min === undefined ? {} : { min })}
      {...(max === undefined ? {} : { max })}
      {...(precision === undefined ? {} : { precision })}
      {...(fieldState.error?.message === undefined ? {} : { error: fieldState.error.message })}
    />
  );
}
