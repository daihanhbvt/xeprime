'use client';

import { Checkbox, Form } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './field.module.css';

interface CheckboxFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** Chữ nằm CẠNH ô tick, không phải nhãn phía trên — một câu khẳng định người dùng bật/tắt. */
  children: ReactNode;
  disabled?: boolean;
  help?: ReactNode;
}

/**
 * Một ô tick đơn nối RHF ↔ AntD.
 *
 * Khác `CheckboxGroupField` (nhiều lựa chọn, field giữ mảng): ở đây field là `boolean`. Dùng cho
 * một công tắc nằm trong form và được GỬI/đọc cùng form — nếu nó chỉ đổi giao diện và không
 * thuộc dữ liệu form thì đó là việc của `SwitchField` hoặc state cục bộ.
 */
export function CheckboxField<T extends FieldValues>({
  control,
  name,
  children,
  disabled,
  help,
}: CheckboxFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const helpId = `${String(name)}-${useId()}-help`;
  const helpText = fieldState.error?.message ?? help;

  return (
    <Form.Item
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={helpId}>{helpText}</span> : undefined}
      className={styles.item}
    >
      <Checkbox
        checked={Boolean(field.value)}
        disabled={disabled}
        onChange={(e) => field.onChange(e.target.checked)}
        onBlur={field.onBlur}
        aria-describedby={helpText ? helpId : undefined}
      >
        {children}
      </Checkbox>
    </Form.Item>
  );
}
