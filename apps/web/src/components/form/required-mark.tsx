import type { ReactNode } from 'react';
import styles from './field.module.css';

/**
 * Dấu bắt buộc đặt SAU nhãn (Figma `193:1619`: "Tên xe" rồi mới tới `*`).
 * Mặc định của AntD là đặt TRƯỚC nhãn — ngược với thiết kế.
 *
 * Truyền vào `<Form component={false} requiredMark={trailingRequiredMark}>`; AntD gọi lại nó
 * cho MỌI `Form.Item` trong ngữ cảnh đó, nên không form nào phải tự dựng nhãn tuỳ biến.
 */
export function trailingRequiredMark(label: ReactNode, { required }: { required: boolean }) {
  return (
    <>
      {label}
      {required ? (
        <span className={styles.requiredMarkAfter} aria-hidden="true">
          *
        </span>
      ) : null}
    </>
  );
}
