'use client';

import { Form, Input } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './field.module.css';

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /**
   * `ReactNode` chứ không phải `string`: form nào cần gắn thêm dấu hiệu riêng cạnh nhãn thì tự
   * dựng lấy, thay vì common code phải biết quy ước của từng feature.
   */
  label: ReactNode;
  type?: 'text' | 'email' | 'password' | 'tel';
  placeholder?: string;
  autoComplete?: string;
  prefix?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Hiện dấu bắt buộc của AntD. Ràng buộc thật vẫn nằm ở schema Yup, đây chỉ là dấu hiệu. */
  required?: boolean;
  /** Gợi ý dưới ô nhập khi KHÔNG có lỗi. Lỗi luôn thắng — không hiện cả hai cùng lúc. */
  help?: ReactNode;
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
  required,
  help,
}: TextFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  // `Form.Item` chỉ tự nối label ↔ input khi nằm trong `<Form>` của AntD. Các form ở đây dùng
  // React Hook Form nên phải tự gán `id`/`htmlFor`: thiếu nó, bấm vào label không focus được ô
  // nhập và trình đọc màn hình không đọc ra tên trường.
  const inputId = `${String(name)}-${useId()}`;
  const describedById = `${inputId}-help`;
  const helpText = fieldState.error?.message ?? help;
  const shared = {
    ...field,
    id: inputId,
    placeholder,
    autoComplete,
    inputMode: type === 'tel' ? ('tel' as const) : undefined,
    autoFocus,
    prefix,
    disabled,
    'aria-describedby': helpText ? describedById : undefined,
    'aria-invalid': fieldState.error ? true : undefined,
    status: fieldState.error ? ('error' as const) : undefined,
  };

  return (
    <Form.Item
      label={label}
      htmlFor={inputId}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      {type === 'password' ? (
        <Input.Password {...shared} />
      ) : (
        <Input {...shared} type={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text'} />
      )}
    </Form.Item>
  );
}
