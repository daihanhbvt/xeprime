'use client';

import { Form, InputNumber } from 'antd';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

interface NumberFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Định dạng tiền VND: dấu chấm phân nhóm + hậu tố ₫. Giá trị vẫn là number, không phải string. */
  money?: boolean;
  addonAfter?: string;
}

/** Nhóm nghìn theo kiểu Việt Nam (1.000.000) cho ô nhập tiền. */
const groupThousands = (value: string | number | undefined): string =>
  `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Ô nhập số nối RHF ↔ AntD. Giá trị là `number | null` (khớp schema yup), tiền vẫn giữ number
 * ở form và chỉ hoá string khi gửi API (ADR 0007) — không parse float ở tầng hiển thị tiền.
 */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  min,
  max,
  money,
  addonAfter,
}: NumberFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Form.Item
      label={label}
      validateStatus={fieldState.error ? 'error' : ''}
      help={fieldState.error?.message}
      style={{ marginBottom: 14 }}
    >
      <InputNumber
        style={{ width: '100%' }}
        size="large"
        value={(field.value as number | null | undefined) ?? null}
        onChange={(value) => field.onChange(value ?? null)}
        onBlur={field.onBlur}
        min={min}
        max={max}
        placeholder={placeholder}
        addonAfter={addonAfter ?? (money ? '₫' : undefined)}
        formatter={money ? groupThousands : undefined}
        parser={
          money
            ? (displayValue) => {
                // Bỏ dấu phân nhóm, trả số; rỗng trả null để AntD xoá giá trị (ép kiểu cho khớp
                // generic InputNumber<number> — AntD chấp nhận null lúc chạy).
                const digits = (displayValue ?? '').replace(/\D/g, '');
                return (digits === '' ? null : Number(digits)) as unknown as number;
              }
            : undefined
        }
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
