'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import styles from './DashboardPanel.module.css';

/**
 * Khung panel của dashboard: tiêu đề + nội dung. Không truyền `children` (hoặc rỗng) thì
 * hiện trạng thái rỗng — panel luôn có hình hài rõ ràng dù chưa có dữ liệu.
 */
export function DashboardPanel({
  title,
  icon,
  empty,
  extra,
  children,
}: {
  title: string;
  icon?: ReactNode;
  /** Góc phải đầu panel — một link đi tiếp ("Xem tất cả") hoặc nhãn ngữ cảnh ("Chỉ xem"). */
  extra?: ReactNode;
  /** Câu trạng thái rỗng riêng của panel. Bỏ trống thì dùng câu chung của `Common`. */
  empty?: string;
  children?: ReactNode;
}) {
  const tCommon = useTranslations('Common');
  const hasContent = Boolean(children);
  const emptyText = empty ?? tCommon('states.empty');
  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        {icon ? <span className={styles.headIcon}>{icon}</span> : null}
        <span className={styles.title}>{title}</span>
        {extra ? <span className={styles.extra}>{extra}</span> : null}
      </header>
      <div className={styles.body}>
        {hasContent ? children : <div className={styles.empty}>{emptyText}</div>}
      </div>
    </section>
  );
}
