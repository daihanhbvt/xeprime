import Link from 'next/link';
import { LineIcon } from '@/components/icons/LineIcon';
import { cx } from '@/lib/cx';
import styles from './HeadLink.module.css';

/** Nút chữ vàng + mũi tên phải ở đầu/cuối thẻ Tổng quan (Figma "Button" link `8636:7706`). */
export function HeadLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(styles.link, className)}>
      {label}
      <LineIcon name="arrow-right" className={styles.arrow} />
    </Link>
  );
}
