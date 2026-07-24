'use client';

import { DatePicker, Form } from 'antd';
import type { Dayjs } from 'dayjs';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

interface DateTimeFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
}

/**
 * Ô chọn ngày-giờ nối RHF ↔ AntD DatePicker (giá trị là `Dayjs | null`). Dùng cho nhận/trả xe.
 * Cùng khuôn với các field form khác (ADR 0004: form state ở RHF).
 */
export function DateTimeField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
}: DateTimeFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      style={{ marginBottom: 14 }}
    >
      <DatePicker
        style={{ width: '100%' }}
        size="large"
        showTime={{ format: 'HH:mm', minuteStep: 15 }}
        format="DD/MM/YYYY HH:mm"
        value={(field.value as Dayjs | null) ?? null}
        onChange={(value) => field.onChange(value)}
        onBlur={field.onBlur}
        placeholder={placeholder}
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
