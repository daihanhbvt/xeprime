'use client';

import { Form, Input } from 'antd';
import type { ReactNode } from 'react';
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
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const shared = {
    ...field,
    size: 'large' as const,
    placeholder,
    autoComplete,
    autoFocus,
    prefix,
    status: fieldState.error ? ('error' as const) : undefined,
  };

  return (
    <Form.Item
      label={label}
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
