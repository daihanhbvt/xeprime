'use client';

import { AutoComplete, Form } from 'antd';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

interface AutoCompleteFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Gợi ý sẵn (vd danh sách hãng xe curated) — vẫn cho nhập tự do ngoài danh sách. */
  options: ReadonlyArray<{ readonly value: string; readonly label?: string }>;
  placeholder?: string;
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
}: AutoCompleteFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      style={{ marginBottom: 14 }}
    >
      <AutoComplete
        size="large"
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
