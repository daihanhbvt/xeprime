import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './SectionCard.module.css';

interface SectionCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Góc phải tiêu đề — công tắc, link "Chỉnh sửa"… */
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  /** `h1` cho khối đầu tiên của trang (mỗi mục đúng một h1), mặc định `h2`. */
  headingLevel?: 1 | 2;
}

/**
 * Thẻ trắng của các mục trong không gian quản lý xe — một khuôn cho 13 màn để chúng trông là
 * một sản phẩm, không phải mười ba cách kẻ viền.
 */
export function SectionCard({
  title,
  subtitle,
  extra,
  children,
  className,
  headingLevel = 2,
}: SectionCardProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className={cx(styles.card, className)}>
      {title || extra ? (
        <div className={styles.head}>
          <div className={styles.headText}>
            {title ? <Heading className={styles.title}>{title}</Heading> : null}
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          {extra ? <div className={styles.extra}>{extra}</div> : null}
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
