import type { ReactNode } from 'react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import styles from './FeatureCard.module.css';

export interface FeatureCardProps {
  readonly title: string;
  readonly desc: string;
  /**
   * Huy hiệu góc trái — số thứ tự ("1") hoặc một icon. Bỏ trống thì thẻ không có huy hiệu và
   * tiêu đề lùi sát mép, dùng cho lưới thuần thông tin.
   */
  readonly badge?: ReactNode;
  /** Có `href` thì cả thẻ thành một liên kết; không có thì nó là khối thông tin tĩnh. */
  readonly href?: string;
  readonly className?: string;
}

/**
 * Thẻ "một ý" dùng chung ở trang giới thiệu, trang ứng dụng và trung tâm trợ giúp.
 *
 * Hai dạng trong MỘT component có chủ đích: dạng tĩnh và dạng bấm được chỉ khác nhau ở chỗ có
 * `href` hay không, nên tách làm hai component là hai bản sao của cùng một bố cục sẽ lệch nhau
 * sau lần sửa thứ hai. Dạng bấm được lấy `<a>` bọc CẢ thẻ — một tiêu đề link nhỏ xíu giữa thẻ
 * là bẫy trên màn cảm ứng.
 */
export function FeatureCard({ title, desc, badge, href, className }: FeatureCardProps) {
  const body = (
    <>
      {badge != null && (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      )}
      <span className={styles.title}>{title}</span>
      <span className={styles.desc}>{desc}</span>
      {href && (
        /* Mũi tên chỉ xuất hiện ở thẻ bấm được — nó là lời hứa "chỗ này dẫn đi đâu đó". */
        <span className={styles.arrow} aria-hidden="true" />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cx(styles.card, styles.clickable, className)}>
        {body}
      </Link>
    );
  }

  return <div className={cx(styles.card, className)}>{body}</div>;
}
