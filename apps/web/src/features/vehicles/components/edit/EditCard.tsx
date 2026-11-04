import { useId, type ReactNode } from 'react';

import { cx } from '@/lib/cx';

import panes from './EditPanes.module.css';
import styles from './VehicleEditShell.module.css';

/**
 * Thẻ trắng của màn sửa xe (design `23731:37932`) — một khuôn cho mọi khối để mười mục trông là một
 * sản phẩm. Thẻ là một `section` mang tên chính tiêu đề của nó, nên trình đọc màn hình (và test)
 * gọi đúng khối theo tên.
 */
export function EditCard({
  title,
  subtitle,
  extra,
  className,
  children,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Góc phải tiêu đề — công tắc, link… */
  extra?: ReactNode;
  className?: string;
  children?: ReactNode;
  /** Neo để link cũ cuộn tới đúng khối (vd điều khoản của một dịch vụ). */
  id?: string;
}) {
  const titleId = useId();
  return (
    <section
      id={id}
      className={cx(styles.card, className)}
      aria-labelledby={title ? titleId : undefined}
    >
      {title || extra ? (
        <div className={styles.cardHead}>
          <div className={styles.cardHeadText}>
            {title ? (
              <h2 id={titleId} className={styles.cardTitle}>
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
          </div>
          {extra ? <div className={styles.cardExtra}>{extra}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Hàng "tiêu đề + mô tả · công tắc" trong thẻ — công tắc dịch vụ, tự nhận chuyến, chính sách gian hàng. */
export function EditToggleRow({
  title,
  hint,
  control,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={panes.toggleRow}>
      <div className={panes.toggleText}>
        <h3 className={panes.toggleTitle}>{title}</h3>
        {hint ? <p className={panes.toggleHint}>{hint}</p> : null}
        {children}
      </div>
      {control}
    </div>
  );
}
