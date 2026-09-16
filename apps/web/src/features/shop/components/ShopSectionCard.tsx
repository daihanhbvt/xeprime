'use client';

import type { ReactNode } from 'react';

import { cx } from '@/lib/cx';

import styles from './ShopSectionCard.module.css';

export interface ShopSectionCardProps {
  /** `id` trong DOM — cũng là đích của `?section=` và của `aria-controls` ở cột điều hướng. */
  id?: string;
  title: string;
  /** Một dòng giải thích. Bỏ trống khi tiêu đề đã đủ — chữ thừa làm trang dài ra mà không thêm gì. */
  hint?: string;
  /** Hành động ở góc phải tiêu đề ("Thêm tài khoản", "Gia hạn / đổi gói"). */
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Khung của MỘT section trong trang Cửa hàng — tiêu đề, dòng giải thích tuỳ chọn, hành động.
 *
 * Tồn tại để năm section có cùng một nhịp: cùng padding, cùng cỡ tiêu đề, cùng chỗ đặt nút. Năm
 * khối tự vẽ khung của riêng mình là năm lần lệch nhau vài pixel — thứ người dùng không gọi tên
 * được nhưng đọc ra ngay là "trang này ghép từ nhiều chỗ".
 *
 * Tiêu đề là `h2` và KHÔNG lồng thêm `Card` của AntD: trang đã có `h1` ở tiêu đề trang, và một
 * `Card` bọc ngoài một `section` đã có viền chỉ tạo ra hai khung lồng nhau.
 */
export function ShopSectionCard({
  id,
  title,
  hint,
  extra,
  className,
  children,
}: ShopSectionCardProps) {
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      className={cx(styles.card, className)}
      aria-labelledby={headingId}
      // Đích của `?section=`: cuộn tới rồi đưa tiêu điểm vào chính khối, để người dùng bàn phím
      // đứng đúng chỗ vừa nhảy tới thay vì phải Tab lại từ đầu trang.
      tabIndex={-1}
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title} id={headingId}>
            {title}
          </h2>
          {hint ? <p className={styles.hint}>{hint}</p> : null}
        </div>
        {extra ? <div className={styles.extra}>{extra}</div> : null}
      </header>
      {children}
    </section>
  );
}
