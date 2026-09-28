import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { SelectControl, type SelectControlOption } from './SelectControl';

/**
 * Ô CHỌN của biểu mẫu gắn với React Hook Form — bản native của `SelectField` bên web.
 *
 * Toàn bộ hình dạng và hành vi nằm ở [`SelectControl`](./SelectControl.tsx); file này chỉ làm
 * đúng một việc là nối nó vào RHF. Tách như vậy vì có những lựa chọn không sống trong form (xem
 * docblock của `SelectControl`), và cả hai lối phải ra CÙNG một ô — nếu không thì trên cùng một
 * màn sẽ có hai kiểu "select" khác nhau.
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  hint,
  required = false,
  publishRequired = false,
  placeholder,
  disabled = false,
  onSearch,
  searchPlaceholder,
  emptyText,
  onValueChange,
  allowClear = false,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: readonly SelectControlOption[];
  hint?: string;
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Bật ô tìm trong tấm chọn — xem `SelectControl`. */
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  /**
   * Chạy SAU khi giá trị đã vào form, và CHỈ khi chính người dùng chọn.
   *
   * Có mặt để phân biệt "người dùng vừa chọn" với "form vừa được nạp giá trị" — hai chuyện mà
   * một effect theo dõi `field.value` không tách được. Nơi gọi dùng nó cho việc phụ thuộc vào Ý
   * ĐỊNH: ghi bộ nhớ tỉnh, dọn ô phụ thuộc, gửi số liệu. KHÔNG dùng để sửa lại chính giá trị —
   * đó là việc của schema.
   */
  onValueChange?: (value: string) => void;
  /** Cho phép bỏ chọn — xem `SelectControl`. Ô được xoá về `null`, không phải chuỗi rỗng. */
  allowClear?: boolean;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <SelectControl
      label={label}
      value={(field.value as string | null) ?? null}
      options={options}
      allowClear={allowClear}
      onChange={(next) => {
        /*
         * Bỏ chọn ghi `null`, không phải `''`. Nơi gọi đọc ô này bằng `== null` rồi mới chuyển sang
         * số (giống hệt web, nơi allowClear của AntD trả `undefined`); một chuỗi rỗng lọt qua phép
         * thử đó và `Number('')` là `0` — ô "không đặt sàn" âm thầm thành "sàn 0 phút".
         */
        const value = allowClear && next === '' ? null : next;
        field.onChange(value);
        onValueChange?.(next);
      }}
      required={required}
      publishRequired={publishRequired}
      disabled={disabled}
      {...(hint === undefined ? {} : { hint })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(onSearch === undefined ? {} : { onSearch })}
      {...(searchPlaceholder === undefined ? {} : { searchPlaceholder })}
      {...(emptyText === undefined ? {} : { emptyText })}
      {...(fieldState.error?.message === undefined ? {} : { error: fieldState.error.message })}
    />
  );
}
