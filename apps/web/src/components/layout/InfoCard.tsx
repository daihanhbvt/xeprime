'use client';

import { EditOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './InfoCard.module.css';

/**
 * Khung THẺ có tiêu đề + dòng phụ + bút chì - sinh cho trang Thông tin cửa hàng (design `23999:111274` - "Chủ gian hàng", "Địa chỉ & pháp
 * lý", "Thông tin khai thuế"…): tiêu đề + dòng phụ, nút bút chì ở góc khi sửa được, ghi chú cuối thẻ.
 *
 * `id` là đích của `?section=` (cuộn tới + nhận tiêu điểm) - cùng hợp đồng với `SectionCard`.
 */
export function InfoCard({
  id,
  title,
  hint,
  editLabel,
  onEdit,
  extra,
  footer,
  className,
  children,
}: {
  id?: string;
  title: string;
  hint?: ReactNode;
  /** Nhãn cho trình đọc màn hình + tooltip của nút bút chì. Vắng `onEdit` ⇒ không có nút. */
  editLabel?: string;
  onEdit?: () => void;
  /** Nút / bộ lọc ở góc phải thay cho bút chì (thẻ Chi nhánh, Gói & hạn mức). */
  extra?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      className={cx(styles.card, className)}
      aria-labelledby={headingId}
      tabIndex={id ? -1 : undefined}
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title} id={headingId}>
            {title}
          </h2>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </div>
        {extra ? <div className={styles.extra}>{extra}</div> : null}
        {onEdit ? (
          <Tooltip title={editLabel}>
            <Button
              className={styles.edit}
              icon={<EditOutlined aria-hidden />}
              aria-label={editLabel}
              onClick={onEdit}
            />
          </Tooltip>
        ) : null}
      </header>
      {children}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}

/** Một hàng nhãn ↔ giá trị (căn phải) của thẻ - `value` rỗng hiện `emptyLabel`. */
export function InfoRow({
  label,
  value,
  emptyLabel,
  suffix,
}: {
  label: string;
  value: ReactNode;
  emptyLabel: string;
  suffix?: ReactNode;
}) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={styles.row}>
      <dt className={styles.rowLabel}>{label}</dt>
      <dd className={styles.rowValue}>
        <span className={empty ? styles.empty : undefined}>{empty ? emptyLabel : value}</span>
        {!empty && suffix ? suffix : null}
      </dd>
    </div>
  );
}

export function InfoRows({ children }: { children: ReactNode }) {
  return <dl className={styles.rows}>{children}</dl>;
}
