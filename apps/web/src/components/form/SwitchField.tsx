'use client';

import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { SwitchRow, type SwitchRowProps } from './SwitchRow';

interface SwitchFieldProps<T extends FieldValues> extends Pick<
  SwitchRowProps,
  'label' | 'description' | 'labelExtra' | 'disabled'
> {
  control: Control<T>;
  name: Path<T>;
}

/**
 * Toggle boolean nối RHF ↔ AntD Switch — hàng nhãn + mô tả bên trái, switch bên phải.
 *
 * Nhãn nối vào công tắc bằng `htmlFor` TƯỜNG MINH, không dựa vào việc công tắc nằm trong
 * `<label>`: một `<label>` không có `for` gắn với phần tử labelable ĐẦU TIÊN bên trong nó, và khi
 * `labelExtra` là một nút thật (dấu "i" của `InfoHint`) thì nhãn trỏ vào cái nút đó — công tắc
 * mất tên khả truy cập, và bấm vào chữ nhãn thì mở tooltip thay vì lật công tắc.
 */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  labelExtra,
  disabled,
}: SwitchFieldProps<T>) {
  const { field } = useController({ control, name });

  return (
    <SwitchRow
      label={label}
      description={description}
      labelExtra={labelExtra}
      checked={Boolean(field.value)}
      onChange={field.onChange}
      disabled={disabled}
    />
  );
}
