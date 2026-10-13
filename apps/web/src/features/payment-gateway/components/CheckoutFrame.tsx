import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './CheckoutFrame.module.css';

/**
 * Khung TRANG THANH TOÁN — lối quay lại, tiêu đề, và phần thân. Một bản cho cả hai site để tiền giữ
 * chỗ của khách và hoá đơn gói của gian hàng mở ra cùng một hình dạng: người đã trả ở bên này
 * không phải học lại bên kia.
 *
 * Không đọc dữ liệu, không giữ state — Server Component được, và nằm trong cả vỏ có header (site
 * khách) lẫn trang trần (site partner).
 */
export function CheckoutFrame({
  backHref,
  backLabel,
  title,
  subtitle,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <Link href={backHref} className={styles.back}>
        <ArrowLeftOutlined aria-hidden />
        {backLabel}
      </Link>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}
