import { useId, type ReactNode } from 'react';

import styles from './ShopPolicies.module.css';

/**
 * Thẻ trắng "Nhóm thông tin" của trang Chính sách thuê (design `23874:63907`) — tiêu đề 18px, mô tả,
 * nội dung cách 20. Là `section` mang tên chính tiêu đề của nó (trình đọc màn hình, test, neo mục lục).
 */
export function PolicyCard({
  id,
  title,
  titleExtra,
  subtitle,
  children,
}: {
  id?: string;
  title: ReactNode;
  titleExtra?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section id={id} className={styles.card} aria-labelledby={titleId}>
      <header className={styles.cardHead}>
        <h2 id={titleId} className={styles.cardTitle}>
          {title}
          {titleExtra ? <span className={styles.cardTitleExtra}>{titleExtra}</span> : null}
        </h2>
        {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
