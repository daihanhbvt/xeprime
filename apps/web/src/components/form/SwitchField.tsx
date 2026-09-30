'use client';

import { Switch } from 'antd';
import { useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './SwitchField.module.css';

interface SwitchFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Dòng mô tả nhỏ dưới nhãn — giải thích hệ quả của toggle. */
  description?: string;
  /**
   * Chỗ đặt NGAY SAU nhãn — icon thông tin, thẻ "beta"…
   *
   * Cả hàng là một `<label>` nên mọi cú bấm bên trong đều lật công tắc — component TỰ chặn cú
   * bấm trong vùng này (`preventDefault` ở lớp bọc), nơi gọi không phải nhớ làm lại.
   */
  labelExtra?: ReactNode;
  disabled?: boolean;
}

/**
 * Toggle boolean nối RHF ↔ AntD Switch — hàng nhãn + mô tả bên trái, switch bên phải.
 *
 * Nhãn nối vào công tắc bằng `htmlFor` TƯỜNG MINH, không dựa vào việc công tắc nằm trong
 * `<label>`: một `<label>` không có `for` gắn với phần tử labelable ĐẦU TIÊN bên trong nó, và khi
 * `labelExtra` là một nút thật (dấu "i" của `InfoHint`) thì nhãn trỏ vào cái nút đó — công tắc
 * mất tên khả truy cập, và bấm vào chữ nhãn thì mở tooltip thay vì lật công tắc.
 */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  labelExtra,
  disabled,
}: SwitchFieldProps<T>) {
  const { field } = useController({ control, name });
  const id = useId();

  return (
    <label className={styles.row} htmlFor={id}>
      <span className={styles.info}>
        <span className={styles.label}>
          {label}
          {labelExtra ? (
            // Cả hàng là một `<label>`: cú bấm vào phần phụ (dấu "i", popover điều kiện) phải
            // chặn hành vi mặc định ở ĐÂY, không thì đọc lời giải thích cũng là lật công tắc.
            // Chặn một lần cho mọi nơi gọi, thay vì mỗi nơi tự nhớ bọc lấy.
            <span className={styles.extra} onClick={(event) => event.preventDefault()} role="presentation">
              {labelExtra}
            </span>
          ) : null}
        </span>
        {description ? <span className={styles.desc}>{description}</span> : null}
      </span>
      <Switch id={id} checked={Boolean(field.value)} onChange={field.onChange} disabled={disabled} />
    </label>
  );
}
