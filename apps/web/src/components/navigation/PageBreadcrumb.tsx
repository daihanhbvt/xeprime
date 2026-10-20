'use client';

import { LeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import styles from './PageBreadcrumb.module.css';

/** Một mắt của đường dẫn — có `href` thì là liên kết, mắt cuối (trang đang xem) thì không. */
export interface PageCrumb {
  key: string;
  label: string;
  href?: string;
  /** Ẩn ở mobile — thanh 390px chỉ chứa "Trang chủ / trang hiện tại" (Figma `19771:72105`). */
  hideOnMobile?: boolean;
}

export interface PageBreadcrumbBack {
  /**
   * Đích của nút tròn — một đường dẫn THẬT, không phải `router.back()`: mở tab mới, F5 hay vào
   * thẳng từ Google đều về đúng chỗ.
   */
  href: string;
  /** Tên khả truy cập của nút tròn (nút chỉ có icon). */
  label: string;
  /** Chỉ hiện nút ở mobile — đường dẫn PC của trang chi tiết xe không có nút quay lại. */
  mobileOnly?: boolean;
}

/**
 * Nút quay lại tròn + đường dẫn "Trang chủ / … / trang hiện tại" — Figma "Search Fields" của luồng
 * đặt xe (PC `19759:40224`, mobile `19771:72104`). Dùng chung cho trang chi tiết xe và các màn
 * chuyến sau khi gửi yêu cầu, để hai nơi không trôi khỏi nhau.
 *
 * Mobile (≤640px): một thanh trắng tràn mép cao 60, bóng `xs`, ngay dưới header site. Thanh tràn
 * mép bằng lề âm `--page-gutter` — trang chứa nó khai biến này bằng chính lề ngang của mình.
 *
 * Mắt cuối tô vàng — trang khách đang đứng — và mang `aria-current`.
 */
export function PageBreadcrumb({
  ariaLabel,
  crumbs,
  back,
  className,
}: {
  ariaLabel: string;
  crumbs: readonly PageCrumb[];
  back?: PageBreadcrumbBack;
  className?: string;
}) {
  return (
    <nav className={cx(styles.bar, className)} aria-label={ariaLabel}>
      {back ? (
        <Link
          href={back.href}
          className={cx(styles.back, back.mobileOnly && styles.mobileOnly)}
          aria-label={back.label}
        >
          <LeftOutlined aria-hidden />
        </Link>
      ) : null}
      <ol className={styles.trail}>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li
              key={crumb.key}
              className={cx(styles.crumb, crumb.hideOnMobile && styles.desktopOnly)}
            >
              {last ? (
                <span className={styles.current} aria-current="page">
                  {crumb.label}
                </span>
              ) : crumb.href ? (
                <Link href={crumb.href} className={styles.link}>
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
              {last ? null : (
                <span className={styles.separator} aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
