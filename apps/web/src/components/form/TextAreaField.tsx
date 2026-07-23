'use client';

import { Form, Input } from 'antd';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

interface TextAreaFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

/** Ô nhập nhiều dòng nối RHF ↔ AntD — dùng cho mô tả xe, ghi chú… */
export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  rows = 4,
  maxLength,
}: TextAreaFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      style={{ marginBottom: 14 }}
    >
      <Input.TextArea
        {...field}
        value={(field.value as string | null | undefined) ?? ''}
        rows={rows}
        maxLength={maxLength}
        showCount={Boolean(maxLength)}
        placeholder={placeholder}
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
