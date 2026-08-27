'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Form } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import fieldStyles from './field.module.css';
import styles from './ChoiceCardsField.module.css';

export interface ChoiceCardOption {
  readonly value: string;
  readonly label: ReactNode;
  /** Một câu nói rõ HỆ QUẢ của lựa chọn — đây là lý do tồn tại của dạng thẻ. */
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

interface ChoiceCardsFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: ReactNode;
  options: readonly ChoiceCardOption[];
  required?: boolean;
  disabled?: boolean;
  help?: ReactNode;
}

/**
 * Nhóm lựa chọn dạng THẺ — icon + nhãn + một câu mô tả, thẻ đang chọn có viền nhấn và dấu tích.
 *
 * Khác `RadioGroupField` ở mức chú ý, không ở dữ liệu: dùng khi lựa chọn này quyết định phần còn
 * lại của form, nên nó phải đọc được từ xa và mỗi phương án phải tự giải thích. Một hàng radio
 * nhỏ đặt đúng chỗ đó sẽ bị lướt qua, và người dùng điền xong nửa form mới nhận ra mình đang ở
 * nhánh sai.
 *
 * Vẫn là `radiogroup` thật về mặt a11y: input radio ẩn dưới `<label>`, nên bàn phím và trình đọc
 * màn hình thấy đúng một nhóm radio chứ không phải một rừng `<div onClick>`.
 */
export function ChoiceCardsField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  required,
  disabled,
  help,
}: ChoiceCardsFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const groupName = `${String(name)}-${useId()}`;
  const describedById = `${groupName}-help`;
  const helpText = fieldState.error?.message ?? help;
  const value = (field.value as string | null | undefined) ?? undefined;

  return (
    <Form.Item
      label={label}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={fieldStyles.item}
    >
      <div
        className={styles.grid}
        role="radiogroup"
        aria-label={typeof label === 'string' ? label : undefined}
        aria-describedby={helpText ? describedById : undefined}
      >
        {options.map((option) => {
          const checked = value === option.value;
          const cardDisabled = disabled || option.disabled;
          return (
            <label
              key={option.value}
              className={[
                styles.card,
                checked ? styles.checked : '',
                cardDisabled ? styles.disabled : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type="radio"
                className={styles.input}
                name={groupName}
                value={option.value}
                checked={checked}
                disabled={cardDisabled}
                onChange={() => field.onChange(option.value)}
                onBlur={field.onBlur}
              />
              {option.icon ? (
                // Icon minh hoạ cho nhãn ngay cạnh — đọc lại nó chỉ gây nhiễu.
                <span className={styles.icon} aria-hidden="true">
                  {option.icon}
                </span>
              ) : null}
              <span className={styles.body}>
                <span className={styles.label}>{option.label}</span>
                {option.description ? (
                  <span className={styles.description}>{option.description}</span>
                ) : null}
              </span>
              {checked ? (
                <CheckCircleFilled className={styles.check} aria-hidden="true" />
              ) : null}
            </label>
          );
        })}
      </div>
    </Form.Item>
  );
}
