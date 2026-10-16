import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './CtaButton.module.css';

/**
 * Nút hành động của bề mặt chợ v2 (ADR 0062) — ba hình thái của bảng nút trong Figma:
 *
 *   · `gradient` — nút chính vàng gradient, chữ tối ("Tìm kiếm", "Trở thành chủ xe", "Khám phá").
 *   · `outline`  — nền trắng, viền vàng nhạt, chữ vàng ("Xem tất cả xe").
 *   · `link`     — chữ vàng trơn ("Xem gian hàng").
 *
 * Vì sao không dùng `Button` của AntD: gradient + bóng phát sáng + bo 12px không biểu diễn được
 * bằng seed token, và ghi đè `.ant-btn` theo từng khối là cách bảng nút trôi khỏi thiết kế. Nút
 * chính của các khu quản lý vẫn là `Button` AntD — đổi chúng là việc của lượt ráp màn đó.
 *
 * Có `href` ⇒ liên kết thật (`<Link>` trong site, `<a>` khi là URL tuyệt đối sang site khác —
 * ADR 0051), không có ⇒ `<button>`. Một nút điều hướng phải là liên kết để mở tab mới được.
 */
export function CtaButton({
  children,
  href,
  onClick,
  variant = 'gradient',
  size = 'md',
  shape = 'rounded',
  iconStart,
  iconEnd,
  className,
  ariaLabel,
  type = 'button',
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: 'gradient' | 'outline' | 'link';
  /** `md`: chữ 14px (header, "Xem tất cả") · `lg`: chữ 16px, cao 44px (nút "Tìm kiếm"). */
  /** `xl` — nút 56px của khối đối tác: chữ 18/28, đệm phải hẹp để vòng icon ôm sát mép. */
  size?: 'md' | 'lg' | 'xl';
  shape?: 'rounded' | 'pill';
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  className?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
}) {
  const classes = cx(
    styles.button,
    styles[variant],
    styles[size],
    shape === 'pill' && styles.pill,
    className,
  );
  const content = (
    <>
      {iconStart ? (
        <span className={styles.icon} aria-hidden="true">
          {iconStart}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
      {iconEnd ? (
        <span className={styles.icon} aria-hidden="true">
          {iconEnd}
        </span>
      ) : null}
    </>
  );

  if (href) {
    // URL tuyệt đối = sang site khác (đối tác) — điều hướng đầy đủ, không qua router của site này.
    if (/^https?:\/\//.test(href)) {
      return (
        <a href={href} className={classes} aria-label={ariaLabel}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} onClick={onClick} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
