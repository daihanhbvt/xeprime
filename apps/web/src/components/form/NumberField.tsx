'use client';

import { Form, InputNumber } from 'antd';
import { useHelpAsTip } from './help-as-tip';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import { LOCKED_FIELD_CLASS, fieldLockSuffix, type FieldLock } from './field-lock';
import { MoneyInput } from './MoneyInput';
import styles from './field.module.css';

interface NumberFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** `ReactNode` để feature tự gắn dấu hiệu riêng cạnh nhãn (xem `TextField`). */
  label: ReactNode;
  /** Phần tử nằm NGAY SAU chữ nhãn, ví dụ nút giải thích; không được phủ lên ô nhập. */
  labelAccessory?: ReactNode;
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
  /** Số chữ số thập phân CỐ ĐỊNH (luôn hiện đủ, vd `5.00`). Mặc định: tiền và phần trăm nguyên → 0. */
  precision?: number;
  /**
   * TỐI ĐA N chữ số lẻ, hiện đúng số người dùng gõ (`10`, `4,5` chứ không `10.0`, `4.50`): giá trị
   * làm tròn về N chữ số khi đổi. Thắng `precision`.
   */
  decimals?: number;
  /** Dấu thập phân hiển thị — nơi gọi truyền theo ngôn ngữ (`,` cho tiếng Việt). Mặc định `.`. */
  decimalSeparator?: string;
  addonAfter?: string;
  disabled?: boolean;
  /** Dấu bắt buộc của AntD. Ràng buộc thật vẫn ở schema Yup. */
  required?: boolean;
  /** Gợi ý dưới ô nhập khi KHÔNG có lỗi. Lỗi luôn thắng. */
  help?: ReactNode;
  /**
   * Ô tự điền có thể KHOÁ (chỉ đọc + bút trong ô) — truyền cả khi đang mở để khung ô không đổi
   * giữa hai trạng thái (`field-lock.tsx`). Chưa áp cho ô tiền (`money`).
   */
  lock?: FieldLock;
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
  labelAccessory,
  placeholder,
  min,
  max,
  money,
  percent,
  precision,
  decimals,
  decimalSeparator,
  addonAfter,
  disabled,
  required,
  help,
  lock,
}: NumberFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const id = useId();
  const describedById = `${id}-help`;

  const effectiveMin = min ?? (percent ? 0 : undefined);
  const effectiveMax = max ?? (percent ? 100 : undefined);
  const suffix = addonAfter ?? (money ? '₫' : percent ? '%' : undefined);
  // Vùng `HelpAsTipProvider`: ghi chú dời lên nhãn thành ⓘ, dưới ô chỉ còn lỗi.
  const tip = useHelpAsTip(label, help);
  const helpText = fieldState.error?.message ?? tip.help;
  /*
   * Ô số CHỈ nhận ký tự số (18/11/2026): AntD `InputNumber` cho gõ chữ rồi lặng lẽ bỏ lúc rời ô -
   * người dùng thấy "abc" trong ô năm sản xuất mà không biết nó sẽ mất. Chặn ngay lúc gõ + lọc lúc
   * dán. Dấu thập phân chỉ khi ô có số lẻ, dấu trừ chỉ khi ô nhận số âm.
   */
  const allowDecimal = decimals != null || (precision ?? 0) > 0;
  const allowNegative = (effectiveMin ?? 0) < 0;
  const allowedChar = (char: string) =>
    /[0-9]/.test(char) ||
    (allowDecimal && (char === '.' || char === ',' || char === decimalSeparator)) ||
    (allowNegative && char === '-');
  const input = money ? (
    <MoneyInput
      id={id}
      aria-describedby={helpText ? describedById : undefined}
      aria-invalid={fieldState.error ? true : undefined}
      className={styles.control}
      value={(field.value as number | null | undefined) ?? null}
      onChange={(value) => field.onChange(value ?? null)}
      onBlur={field.onBlur}
      min={effectiveMin}
      max={effectiveMax}
      placeholder={placeholder}
      addonAfter={suffix}
      disabled={disabled}
      status={fieldState.error ? 'error' : undefined}
    />
  ) : (
    <InputNumber
      id={id}
      aria-describedby={helpText ? describedById : undefined}
      aria-invalid={fieldState.error ? true : undefined}
      className={lock?.locked ? `${styles.control} ${LOCKED_FIELD_CLASS}` : styles.control}
      readOnly={lock?.locked || undefined}
      // Không hiện nút tăng/giảm: các ô số ở đây (năm, kích thước…) đều gõ trực tiếp.
      controls={false}
      value={(field.value as number | null | undefined) ?? null}
      onChange={(value) =>
        field.onChange(
          value == null
            ? null
            : decimals != null
              ? Math.round(value * 10 ** decimals) / 10 ** decimals
              : value,
        )
      }
      onBlur={field.onBlur}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
        if (!allowedChar(event.key)) event.preventDefault();
      }}
      onPaste={(event) => {
        const text = event.clipboardData.getData('text');
        if ([...text].every(allowedChar)) return;
        event.preventDefault();
        const digits = [...text].filter(allowedChar).join('');
        const parsed = digits ? Number(digits.replace(',', '.')) : NaN;
        if (Number.isFinite(parsed)) field.onChange(parsed);
      }}
      min={effectiveMin}
      max={effectiveMax}
      // `decimals`: không đặt precision (AntD suy số chữ số lẻ HIỂN THỊ từ giá trị và bước), bước 1.
      precision={decimals != null ? undefined : (precision ?? (percent ? 0 : undefined))}
      step={decimals != null ? 1 : undefined}
      decimalSeparator={decimalSeparator}
      placeholder={placeholder}
      suffix={fieldLockSuffix(lock, suffix)}
      disabled={disabled}
      status={fieldState.error ? 'error' : undefined}
    />
  );

  const item = (
    <Form.Item
      label={labelAccessory ? undefined : tip.label}
      htmlFor={labelAccessory ? undefined : id}
      required={labelAccessory ? undefined : required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={styles.item}
    >
      {input}
    </Form.Item>
  );

  if (!labelAccessory) return item;

  return (
    <div className={styles.fieldWithAccessory}>
      <div className={styles.customLabelRow}>
        <label htmlFor={id} className={styles.customLabel}>
          {required ? <span className={styles.requiredMark} aria-hidden="true" /> : null}
          {label}
        </label>
        {labelAccessory}
      </div>
      {item}
    </div>
  );
}
