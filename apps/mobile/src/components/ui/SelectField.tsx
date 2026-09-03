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
  placeholder,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: readonly SelectControlOption[];
  hint?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const { field, fieldState } = useController({ control, name });

  return (
    <SelectControl
      label={label}
      value={(field.value as string | null) ?? null}
      options={options}
      onChange={field.onChange}
      required={required}
      {...(hint === undefined ? {} : { hint })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(fieldState.error?.message === undefined ? {} : { error: fieldState.error.message })}
    />
  );
}
