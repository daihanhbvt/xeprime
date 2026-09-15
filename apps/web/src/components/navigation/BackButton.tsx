'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import styles from './BackButton.module.css';

export interface BackButtonProps {
  /**
   * Đích quay lại. Có `href` thì đi thẳng tới đó (chia sẻ/F5 vẫn đúng); không có thì lùi một
   * bước trong lịch sử — và nếu tab mới không có lịch sử, rơi về `fallbackHref`.
   */
  href?: string;
  /** Đích dự phòng khi dùng chế độ lùi lịch sử mà không có bước nào để lùi. */
  fallbackHref?: string;
  /** Nhãn cạnh mũi tên; mặc định là "Quay lại" của namespace `Common`. */
  label?: ReactNode;
  /** `aria-label` khi nhãn bị thu gọn còn mỗi mũi tên (màn hẹp) — mặc định lấy theo `label`. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Nút quay lại dùng chung cho mọi trang chi tiết (15/09/2026).
 *
 * Một viên thuốc con nhộng: mũi tên trong đĩa tròn + nhãn, viền và bóng nhẹ theo token; hover thì
 * mũi tên trượt sang trái và viền chuyển vàng thương hiệu. Dưới 640px nhãn tự ẩn, chỉ còn đĩa
 * tròn — vẫn đủ 40px vùng chạm và giữ `aria-label` nên trình đọc màn hình không mất chữ.
 *
 * Ưu tiên `href`: một đường dẫn thật thì mở tab mới / bookmark / F5 đều đúng, khác với
 * `router.back()` vốn phụ thuộc lịch sử của tab.
 */
export function BackButton({ href, fallbackHref, label, ariaLabel, className }: BackButtonProps) {
  const t = useTranslations('Common.actions');
  const router = useRouter();
  const text = label ?? t('back');
  const aria = ariaLabel ?? (typeof text === 'string' ? text : undefined);
  const classes = className ? `${styles.back} ${className}` : styles.back;

  const body = (
    <>
      <span className={styles.icon} aria-hidden="true">
        <ArrowLeftOutlined />
      </span>
      <span className={styles.label}>{text}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={aria}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={aria}
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
          return;
        }
        if (fallbackHref) router.push(fallbackHref);
      }}
    >
      {body}
    </button>
  );
}
