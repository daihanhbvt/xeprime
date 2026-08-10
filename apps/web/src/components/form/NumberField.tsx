'use client';

import { Form, InputNumber } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import styles from './field.module.css';

interface NumberFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  placeholder?: string;
  min?: number;
  max?: number;
  /**
   * Định dạng tiền VND: dấu chấm phân nhóm + hậu tố `₫`.
   *
   * Giá trị trong form **vẫn là `number`**, không phải chuỗi đã format — feature hoá chuỗi khi
   * gửi API (ADR 0007). Không quy đổi đơn vị: nhập 350000 thì payload là 350000, không nhân/chia
   * cho nghìn.
   */
  money?: boolean;
  /**
   * Ô nhập phần trăm: hậu tố `%`, kẹp 0–100 nếu feature không tự đặt `min`/`max`.
   * Giá trị là **số phần trăm** (12.5 nghĩa là 12,5%), KHÔNG phải tỉ lệ 0–1.
   */
  percent?: boolean;
  /** Số chữ số thập phân. Mặc định: tiền và phần trăm nguyên → 0. */
  precision?: number;
  addonAfter?: string;
  /** Dấu bắt buộc của AntD. Ràng buộc thật vẫn ở schema Yup. */
  required?: boolean;
  /** Gợi ý dưới ô nhập khi KHÔNG có lỗi. Lỗi luôn thắng. */
  help?: ReactNode;
}

/** Nhóm nghìn theo kiểu Việt Nam (1.000.000) cho ô nhập tiền. */
const groupThousands = (value: string | number | undefined): string =>
  `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Bỏ dấu phân nhóm, trả số nguyên.
 *
 * Cố ý **không** dùng `parseFloat`: tiền VND là số nguyên, và `parseFloat('1.000.000')` trả `1`
 * (dừng ở dấu chấm đầu tiên) — sai 6 chữ số mà không báo lỗi. Chỉ giữ chữ số là cách duy nhất
 * an toàn với quy ước phân nhóm bằng dấu chấm của tiếng Việt.
 */
function parseGroupedInteger(displayValue: string | undefined): number | null {
  const digits = (displayValue ?? '').replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

/**
 * Ô nhập số nối RHF ↔ AntD. Giá trị là `number | null` (khớp schema yup).
 *
 * A11y: `useId()` + `htmlFor` để nhãn thực sự trỏ vào ô nhập. Trước Wave 1C-C field này chỉ đặt
 * `label` lên `Form.Item` mà không nối id, nên ô nhập **không có tên khả truy cập** và
 * `getByLabelText` không tìm ra (nợ D14.4).
 */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  min,
  max,
  money,
  percent,
  precision,
  addonAfter,
  required,
  help,
}: NumberFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const id = useId();
  const describedById = `${id}-help`;

  const effectiveMin = min ?? (percent ? 0 : undefined);
  const effectiveMax = max ?? (percent ? 100 : undefined);
  const suffix = addonAfter ?? (money ? '₫' : percent ? '%' : undefined);
  const helpText = fieldState.error?.message ?? help;

  return (
    <Form.Item
      label={label}
      htmlFor={id}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      <InputNumber
        id={id}
        aria-describedby={helpText ? describedById : undefined}
        aria-invalid={fieldState.error ? true : undefined}
        className={styles.control}
        size="large"
        value={(field.value as number | null | undefined) ?? null}
        onChange={(value) => field.onChange(value ?? null)}
        onBlur={field.onBlur}
        min={effectiveMin}
        max={effectiveMax}
        precision={precision ?? (money || percent ? 0 : undefined)}
        placeholder={placeholder}
        addonAfter={suffix}
        formatter={money ? groupThousands : undefined}
        // Ép kiểu cho khớp generic `InputNumber<number>` — AntD chấp nhận `null` lúc chạy để xoá giá trị.
        parser={money ? (value) => parseGroupedInteger(value) as unknown as number : undefined}
        status={fieldState.error ? 'error' : undefined}
      />
    </Form.Item>
  );
}
