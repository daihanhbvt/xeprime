'use client';

import { Form, Input } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  autoComplete?: string;
  prefix?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
}

/**
 * Ô nhập nối React Hook Form với AntD — hướng common (ADR 0004: form state ở RHF, không Redux).
 *
 * `useController` cầu nối field của RHF sang input AntD; lỗi validate (yup) hiện qua Form.Item.
 * Dùng chung cho mọi form auth để không lặp boilerplate ở từng trang.
 */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  prefix,
  autoFocus,
  disabled,
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  // `Form.Item` chỉ tự nối label ↔ input khi nằm trong `<Form>` của AntD. Các form ở đây dùng
  // React Hook Form nên phải tự gán `id`/`htmlFor`: thiếu nó, bấm vào label không focus được ô
  // nhập và trình đọc màn hình không đọc ra tên trường.
  const inputId = `${String(name)}-${useId()}`;
  const shared = {
    ...field,
    id: inputId,
    size: 'large' as const,
    placeholder,
    autoComplete,
    autoFocus,
    prefix,
    disabled,
    status: fieldState.error ? ('error' as const) : undefined,
  };

  return (
    <Form.Item
      label={label}
      htmlFor={inputId}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      style={{ marginBottom: 14 }}
    >
      {type === 'password' ? (
        <Input.Password {...shared} />
      ) : (
        <Input {...shared} type={type === 'email' ? 'email' : 'text'} />
      )}
    </Form.Item>
  );
}
