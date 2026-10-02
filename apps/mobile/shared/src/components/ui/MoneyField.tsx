import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { MoneyControl } from './MoneyControl';

/**
 * Ô nhập TIỀN — bản native của `MoneyInput` bên web.
 *
 * Toàn bộ hình dạng và hành vi nằm ở [`MoneyControl`](./MoneyControl.tsx); file này chỉ làm đúng
 * một việc là nối nó vào React Hook Form — cùng cặp `NumberControl`/`NumberField`.
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
  publishRequired = false,
  editable = true,
  unit,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  placeholder?: string;
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
  required?: boolean;
  editable?: boolean;
  /**
   * Đơn vị ĐẦY ĐỦ thay cho mỗi ký hiệu tiền — "đ / ngày", "đ / giờ", "đ / tháng".
   *
   * Đúng `addonAfter` mà web đặt trên từng ô giá. Một ô chỉ ghi "₫" đứng cạnh ô khác cũng chỉ
   * ghi "₫" thì hai con số rất khác nhau về bản chất (giá một ngày và giá một tháng) đọc ra như
   * cùng một thang — và người dùng phải suy ra đơn vị từ cái nhãn ở trên.
   */
  unit?: string;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <MoneyControl
      label={label}
      value={(field.value as number | null | undefined) ?? null}
      onChange={field.onChange}
      // RHF cần `onBlur` để đánh dấu `touched` — thiếu nó, `mode: 'onTouched'` không chấm ô này.
      onBlur={field.onBlur}
      required={required}
      publishRequired={publishRequired}
      editable={editable}
      {...(hint === undefined ? {} : { hint })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(unit === undefined ? {} : { unit })}
      {...(fieldState.error?.message === undefined ? {} : { error: fieldState.error.message })}
    />
  );
}
