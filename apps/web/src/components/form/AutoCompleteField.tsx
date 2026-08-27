'use client';

import { AutoComplete, Form } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import fieldStyles from './field.module.css';

interface AutoCompleteFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  /** Gợi ý sẵn (vd danh sách hãng xe curated) — vẫn cho nhập tự do ngoài danh sách. */
  options: ReadonlyArray<{ readonly value: string; readonly label?: string }>;
  placeholder?: string;
  /** Dấu bắt buộc của AntD. Ràng buộc thật vẫn ở schema Yup. */
  required?: boolean;
  /** Gợi ý dưới ô nhập khi KHÔNG có lỗi. Lỗi luôn thắng. */
  help?: ReactNode;
}

/**
 * Ô nhập có gợi ý nối RHF ↔ AntD AutoComplete — dùng khi giá trị NÊN theo danh sách chuẩn
 * (để dữ liệu gom nhóm được, vd facet theo hãng) nhưng không được chặn giá trị lạ.
 */
export function AutoCompleteField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  required,
  help,
}: AutoCompleteFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const inputId = `${String(name)}-${useId()}`;
  const describedById = `${inputId}-help`;
  const helpText = fieldState.error?.message ?? help;

  return (
    <Form.Item
      label={label}
      htmlFor={inputId}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={fieldStyles.item}
    >
      <AutoComplete
        id={inputId}
        aria-describedby={helpText ? describedById : undefined}
        value={(field.value as string | null | undefined) ?? ''}
        options={options as { value: string; label?: string }[]}
        onChange={(value: string) => field.onChange(value)}
        onBlur={field.onBlur}
        placeholder={placeholder}
        filterOption={(input, option) =>
          (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
        }
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
