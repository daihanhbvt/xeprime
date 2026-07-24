'use client';

import type { ReactNode } from 'react';
import styles from './DashboardPanel.module.css';

/**
 * Khung panel của dashboard: tiêu đề + nội dung. Không truyền `children` (hoặc rỗng) thì
 * hiện trạng thái rỗng — panel luôn có hình hài rõ ràng dù chưa có dữ liệu.
 */
export function DashboardPanel({
  title,
  icon,
  empty = 'Chưa có dữ liệu',
  children,
}: {
  title: string;
  icon?: ReactNode;
  empty?: string;
  children?: ReactNode;
}) {
  const hasContent = Boolean(children);
  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        {icon ? <span className={styles.headIcon}>{icon}</span> : null}
        <span className={styles.title}>{title}</span>
      </header>
      <div className={styles.body}>
        {hasContent ? children : <div className={styles.empty}>{empty}</div>}
      </div>
    </section>
  );
}
