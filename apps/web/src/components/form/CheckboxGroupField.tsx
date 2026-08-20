'use client';

import { Checkbox, Form } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './field.module.css';

export interface CheckboxGroupFieldOption {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

interface CheckboxGroupFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: ReactNode;
  options: readonly CheckboxGroupFieldOption[];
  disabled?: boolean;
  required?: boolean;
  help?: ReactNode;
  vertical?: boolean;
}

/**
 * Checkbox group nối RHF ↔ AntD cho field giữ MẢNG giá trị (ADR 0004).
 *
 * Bỏ hết lựa chọn trả mảng RỖNG chứ không phải null — schema `.min(1)` mới báo được lỗi, và
 * backend nhận đúng shape mà CHECK ở DB mong đợi.
 */
export function CheckboxGroupField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  disabled,
  required,
  help,
  vertical = true,
}: CheckboxGroupFieldProps<T>) {
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
      {/*
        `Checkbox.Group` của AntD không nhận `id`/`aria-describedby`, nên nhóm a11y nằm ở div bọc
        ngoài — vẫn đúng vai `group` và vẫn trỏ được tới dòng lỗi/gợi ý.
      */}
      <div
        id={groupId}
        role="group"
        aria-describedby={helpText ? describedById : undefined}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <Checkbox.Group
          value={(field.value as string[] | null | undefined) ?? []}
          onChange={(value) => field.onChange(value as string[])}
          disabled={disabled}
          className={vertical ? styles.checkboxStack : undefined}
        >
          {options.map((option) => (
            <Checkbox key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </div>
    </Form.Item>
  );
}
