'use client';

import { Form, Select } from 'antd';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

export interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: readonly SelectFieldOption[];
  placeholder?: string;
  /** Cho phép xoá chọn (field về null) — dùng cho select tuỳ chọn như nhiên liệu. */
  allowClear?: boolean;
  disabled?: boolean;
}

/**
 * Select nối RHF ↔ AntD (ADR 0004: form state ở RHF). Options truyền vào từ META/LABEL của
 * `@xeprime/types`, component không tự biết giá trị nghiệp vụ nào (CLAUDE.md mục 5).
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  allowClear,
  disabled,
}: SelectFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      style={{ marginBottom: 14 }}
    >
      <Select
        size="large"
        value={(field.value as string | null | undefined) ?? undefined}
        onChange={(value: string | undefined) => field.onChange(value ?? null)}
        onBlur={field.onBlur}
        options={options as { value: string; label: string }[]}
        placeholder={placeholder}
        allowClear={allowClear}
        disabled={disabled}
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
