import { useId, type ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './AccountPanel.module.css';

/**
 * Thẻ một mục của khu tài khoản — design Account ("Profile Heading", Figma `21636:83664`): nền
 * trắng bo 16, đầu thẻ là tiêu đề 18px + một dòng mô tả, góc phải dành cho MỘT thứ (lối tắt số dư,
 * bộ chuyển tab), gạch mảnh ngăn đầu thẻ với nội dung.
 *
 * Một khung cho mọi mục ("Thông tin tài khoản", "Giấy tờ & Xác minh", "Quản lý thanh toán"…) để
 * các mục đứng cạnh nhau đọc ra là CÙNG một trang, không phải mỗi thẻ một kiểu bo, một cỡ chữ.
 *
 * `as`: cấp tiêu đề. Mục là nội dung chính của trang thì `h1` (vỏ `AccountShell` không mang `h1`);
 * mục đứng dưới một mục khác cùng trang thì `h2`.
 *
 * Không `'use client'`: không state, không icon — dùng được cả trong Server Component.
 */
export function AccountPanel({
  title,
  subtitle,
  extra,
  as: Heading = 'h2',
  id,
  spacious = false,
  titleSize = 'md',
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  as?: 'h1' | 'h2';
  /** Đích cuộn tới (`#anchor`) — đặt trên chính thẻ. */
  id?: string;
  /** Đệm và khoảng 24 thay vì 20 — mục có nội dung dày (Giấy tờ & Xác minh). */
  spacious?: boolean;
  /** `lg` — tiêu đề 24px của các trang chỉ có MỘT thẻ (design Account / Security). */
  titleSize?: 'md' | 'lg';
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section
      id={id}
      className={cx(styles.panel, spacious && styles.spacious, className)}
      aria-labelledby={headingId}
    >
      <header className={styles.head}>
        <div className={styles.text}>
          <Heading
            id={headingId}
            className={cx(styles.title, titleSize === 'lg' && styles.titleLg)}
          >
            {title}
          </Heading>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {extra ? <div className={styles.extra}>{extra}</div> : null}
      </header>
      {children}
    </section>
  );
}
