'use client';

import { Switch } from 'antd';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import styles from './SwitchField.module.css';

interface SwitchFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  /** Dòng mô tả nhỏ dưới nhãn — giải thích hệ quả của toggle. */
  description?: string;
  disabled?: boolean;
}

/** Toggle boolean nối RHF ↔ AntD Switch — hàng nhãn + mô tả bên trái, switch bên phải. */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
}: SwitchFieldProps<T>) {
  const { field } = useController({ control, name });

  return (
    <label className={styles.row}>
      <span className={styles.info}>
        <span className={styles.label}>{label}</span>
        {description ? <span className={styles.desc}>{description}</span> : null}
      </span>
      <Switch checked={Boolean(field.value)} onChange={field.onChange} disabled={disabled} />
    </label>
  );
}
