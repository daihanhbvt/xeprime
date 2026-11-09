import type { ReactNode } from 'react';

import styles from './DialogHeading.module.css';

/**
 * Tiêu đề hộp thoại kèm DÒNG PHỤ — khuôn của các hộp ở site partner (design 06/11/2026: "Địa chỉ &
 * pháp lý · Cập nhật địa điểm giao nhận xe…"). Truyền vào `title` của `ResponsiveDialog`.
 */
export function DialogHeading({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <span className={styles.heading}>
      <span className={styles.title}>{title}</span>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </span>
  );
}
