'use client';

import { Form, InputNumber, Slider } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import { useAppFormat } from '@/i18n/use-app-format';
import { useDecimalSeparator } from '@/i18n/use-decimal-separator';
import styles from './PercentSliderField.module.css';

interface PercentSliderFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
  /** Ngay sau chữ nhãn — dấu ⓘ. Nằm NGOÀI `<label>` để bấm vào nó không nhảy focus. */
  labelAccessory?: ReactNode;
  min?: number;
  max: number;
  /** Bước của thanh kéo. Ô số bên cạnh nhận tới `precision` chữ số lẻ. */
  step?: number;
  /** Số chữ số lẻ tối đa của ô số — giá trị được làm tròn về đó. Mặc định 2. */
  precision?: number;
  disabled?: boolean;
  required?: boolean;
  help?: ReactNode;
}

/**
 * Ô PHẦN TRĂM dạng thanh kéo + ô số (RHF ↔ AntD). Kéo cho nhanh, gõ cho chính xác — hai điều khiển
 * cùng một giá trị. Giá trị là SỐ PHẦN TRĂM (12.5 = 12,5%), không phải tỉ lệ 0–1.
 *
 * Ô số không đặt `precision` cố định: `precision={2}` hiện "0.00" cho số 0 và luôn kèm hai số lẻ thừa.
 * Thay vào đó giá trị được làm tròn khi đổi, và dấu thập phân theo ngôn ngữ đang xem.
 */
export function PercentSliderField<T extends FieldValues>({
  control,
  name,
  label,
  labelAccessory,
  min = 0,
  max,
  step = 0.5,
  precision = 2,
  disabled,
  required,
  help,
}: PercentSliderFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const fmt = useAppFormat();
  const decimalSeparator = useDecimalSeparator();
  const id = useId();
  const describedById = `${id}-help`;
  const factor = 10 ** precision;
  const value =
    typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : null;
  const set = (next: number | null) =>
    field.onChange(next == null ? null : Math.round(next * factor) / factor);
  const helpText = fieldState.error?.message ?? help;
  const middle = Math.round(((min + max) / 2) * factor) / factor;
  const mark = (v: number) => `${fmt.rate(v)}%`;

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {required ? <span className={styles.requiredMark} aria-hidden="true" /> : null}
          {label}
        </label>
        {labelAccessory}
      </div>
      <Form.Item
        validateStatus={fieldState.error ? 'error' : ''}
        help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
        className={styles.item}
      >
        <div className={styles.controls}>
          <Slider
            className={styles.slider}
            min={min}
            max={max}
            step={step}
            value={value ?? min}
            onChange={(next: number) => set(next)}
            onChangeComplete={() => field.onBlur()}
            marks={{ [min]: mark(min), [middle]: mark(middle), [max]: mark(max) }}
            tooltip={{ formatter: (v) => (v == null ? '' : mark(v)) }}
            disabled={disabled}
            // Thanh kéo là cách nhập PHỤ của cùng giá trị — tên khả truy cập lấy từ nhãn chung.
            aria-hidden
            tabIndex={-1}
          />
          <InputNumber<number>
            id={id}
            className={styles.input}
            aria-describedby={helpText ? describedById : undefined}
            aria-invalid={fieldState.error ? true : undefined}
            controls={false}
            min={min}
            max={max}
            // Bước 1 cho ô số: AntD suy số chữ số lẻ HIỂN THỊ từ `step` — bước 0,5 làm 50 hiện "50,0".
            // Gõ 12,25 vẫn được (làm tròn ở `set`).
            step={1}
            value={value}
            onChange={(next) => set(next ?? null)}
            onBlur={field.onBlur}
            decimalSeparator={decimalSeparator}
            suffix="%"
            disabled={disabled}
            status={fieldState.error ? 'error' : undefined}
          />
        </div>
      </Form.Item>
    </div>
  );
}
