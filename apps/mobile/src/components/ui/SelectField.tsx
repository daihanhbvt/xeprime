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
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <SelectControl
      label={label}
      value={(field.value as string | null) ?? null}
      options={options}
      onChange={field.onChange}
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
