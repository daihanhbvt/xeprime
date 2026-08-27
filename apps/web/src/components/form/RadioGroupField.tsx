'use client';

import { Form, Radio } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './field.module.css';

export interface RadioGroupFieldOption {
  readonly value: string;
  readonly label: ReactNode;
  /** Dòng mô tả nhỏ dưới nhãn — dùng khi lựa chọn cần giải thích hệ quả. */
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

interface RadioGroupFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: ReactNode;
  options: readonly RadioGroupFieldOption[];
  disabled?: boolean;
  required?: boolean;
  help?: ReactNode;
  /** Xếp dọc — mặc định cho lựa chọn có mô tả; ngang chỉ hợp với nhãn ngắn. */
  vertical?: boolean;
}

/**
 * Radio group nối RHF ↔ AntD (ADR 0004). Dùng thay `SelectField` khi tập lựa chọn nhỏ và CHÍNH
 * nó là quyết định của màn hình — người dùng cần thấy đủ các phương án cùng lúc, không phải mở
 * một danh sách ra mới biết mình có gì.
 *
 * Options truyền từ META/LABEL của `@xeprime/types`; component không biết giá trị nghiệp vụ nào.
 */
export function RadioGroupField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  disabled,
  required,
  help,
  vertical = true,
}: RadioGroupFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const groupId = `${String(name)}-${useId()}`;
  const describedById = `${groupId}-help`;
  const helpText = fieldState.error?.message ?? help;

  return (
    <Form.Item
      label={label}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      <Radio.Group
        id={groupId}
        aria-describedby={helpText ? describedById : undefined}
        value={(field.value as string | null | undefined) ?? undefined}
        onChange={(e) => field.onChange(e.target.value as string)}
        onBlur={field.onBlur}
        disabled={disabled}
        className={vertical ? styles.radioStack : undefined}
      >
        {options.map((option) => (
          <Radio key={option.value} value={option.value} disabled={option.disabled}>
            <span className={styles.choiceLabel}>{option.label}</span>
            {option.description ? (
              <span className={styles.choiceDescription}>{option.description}</span>
            ) : null}
          </Radio>
        ))}
      </Radio.Group>
    </Form.Item>
  );
}
