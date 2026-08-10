'use client';

import { Form, Input } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import styles from './field.module.css';

interface TextAreaFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  placeholder?: string;
  rows?: number;
  /** Đặt `maxLength` là bật luôn bộ đếm ký tự, trừ khi tắt bằng `showCount={false}`. */
  maxLength?: number;
  /** Ép bật/tắt bộ đếm độc lập với `maxLength` (Figma `62:1581` Character Counter). */
  showCount?: boolean;
  /** Gợi ý dưới ô nhập khi KHÔNG có lỗi. Lỗi luôn thắng — không hiện cả hai cùng lúc. */
  help?: ReactNode;
  /** Dấu bắt buộc của AntD. Ràng buộc thật vẫn ở schema Yup. */
  required?: boolean;
}

/**
 * Ô nhập nhiều dòng nối RHF ↔ AntD — dùng cho mô tả xe, ghi chú…
 *
 * Không chứa validation: thông báo lỗi đến từ resolver Yup của feature qua `fieldState.error`
 * (CLAUDE.md §3 — RHF + Yup). Ở đây chỉ nối lỗi đó vào ô nhập cho đúng ngữ nghĩa.
 *
 * A11y: `useId()` + `htmlFor` nối nhãn với ô nhập, và `aria-describedby` nối phần gợi ý/lỗi —
 * trước Wave 1C-C ô này không có tên khả truy cập (nợ D14.4).
 */
export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  rows = 4,
  maxLength,
  showCount,
  help,
  required,
}: TextAreaFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const id = useId();
  const describedById = `${id}-help`;

  const errorMessage = fieldState.error?.message;
  const helpText = errorMessage ?? help;

  return (
    <Form.Item
      label={label}
      htmlFor={id}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      <Input.TextArea
        {...field}
        id={id}
        value={(field.value as string | null | undefined) ?? ''}
        rows={rows}
        maxLength={maxLength}
        showCount={showCount ?? Boolean(maxLength)}
        placeholder={placeholder}
        aria-describedby={helpText ? describedById : undefined}
        aria-invalid={fieldState.error ? true : undefined}
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
