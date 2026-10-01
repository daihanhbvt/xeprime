'use client';

import { Switch } from 'antd';
import { useId, type ReactNode } from 'react';
import styles from './SwitchField.module.css';

export interface SwitchRowProps {
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
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Công tắc LƯU NGAY (gọi API khi bấm) hiện vòng quay trong lúc chờ. */
  loading?: boolean;
}

/**
 * Hàng công tắc — nhãn + mô tả bên trái, switch bên phải. Phần TRÌNH BÀY dùng chung của
 * `SwitchField` (nối RHF) và của các công tắc lưu ngay không thuộc form nào.
 */
export function SwitchRow({
  label,
  description,
  labelExtra,
  checked,
  onChange,
  disabled,
  loading,
}: SwitchRowProps) {
  /*
   * Nhãn nối vào công tắc bằng `htmlFor` TƯỜNG MINH: `<label>` không có `for` gắn với phần tử
   * labelable ĐẦU TIÊN bên trong, và khi `labelExtra` là một nút thật (dấu "i" của `InfoHint`)
   * thì công tắc mất tên khả truy cập.
   */
  const id = useId();
  return (
    <label className={styles.row} htmlFor={id}>
      <span className={styles.info}>
        <span className={styles.label}>
          {label}
          {labelExtra ? (
            // Chặn một lần cho mọi nơi gọi: đọc lời giải thích không được lật công tắc.
            <span className={styles.extra} onClick={(event) => event.preventDefault()} role="presentation">
              {labelExtra}
            </span>
          ) : null}
        </span>
        {description ? <span className={styles.desc}>{description}</span> : null}
      </span>
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} loading={loading} />
    </label>
  );
}
