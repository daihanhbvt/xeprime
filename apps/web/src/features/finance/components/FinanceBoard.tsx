import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './FinanceBoard.module.css';

/**
 * Khung "Bảng tổng hợp …" của hai tab Lịch sử giao dịch (design `23813:58308` · `23857:58932`):
 * thẻ trắng bo 16, tiêu đề 18 + hành động bên phải, hàng lọc, rồi bảng.
 *
 * Một component cho cả hai tab vì người dùng chuyển qua lại giữa chúng trong cùng một màn — lệch
 * nhau vài pixel ở đệm hay cỡ tiêu đề là thứ đọc ra ngay là "hai màn ghép lại".
 */
export function FinanceBoard({
  title,
  actions,
  toolbar,
  className,
  children,
}: {
  title: string;
  /** Lớp bổ sung của khung — vd cỡ chữ riêng cho bảng bên trong. */
  className?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cx(styles.board, className)} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
      {children}
    </section>
  );
}
