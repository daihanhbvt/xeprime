'use client';

import { useState } from 'react';
import { cx } from '@/lib/cx';
import styles from './BrandMark.module.css';

/**
 * Logo hãng xe ở bộ lọc chợ — đọc `iconUrl` của DANH MỤC (`catalog_items.icon_url`), tức đúng ảnh
 * admin tải lên ở màn "Danh mục hệ thống". Không có ảnh, hoặc ảnh hỏng, thì hiện monogram chữ cái
 * đầu: hãng mới admin vừa thêm vẫn hiển thị tử tế trước khi có logo.
 */
export function BrandMark({
  label,
  iconUrl,
  className,
}: {
  label: string;
  iconUrl?: string | null;
  className?: string;
}) {
  // Nhớ URL đã lỗi chứ không nhớ cờ `true`: admin thay logo thì URL mới được thử lại.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!iconUrl || failedSrc === iconUrl) {
    return (
      <span className={cx(styles.monogram, className)} aria-hidden="true">
        {label.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo nhỏ do admin khai, có thể là URL R2 ngoài
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className={cx(styles.logo, className)}
      loading="lazy"
      onError={() => setFailedSrc(iconUrl)}
    />
  );
}
