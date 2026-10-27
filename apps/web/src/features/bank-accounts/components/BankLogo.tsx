'use client';

import { useState } from 'react';
import { bankInitials, bankLogoUrl } from '@xeprime/domain';
import { cx } from '@/lib/cx';
import styles from './BankLogo.module.css';

/**
 * Logo ngân hàng theo MÃ VietQR (`bankLogoUrl`). Mã lạ hoặc ảnh tải hỏng ⇒ lùi về ô chữ viết tắt
 * (`bankInitials`) — ô biểu trưng không bao giờ là một ảnh vỡ.
 *
 * Trang trí thuần: tên ngân hàng luôn đứng cạnh bằng chữ, nên ảnh để `alt=""`.
 */
export function BankLogo({
  code,
  size = 'sm',
  className,
}: {
  code: string;
  size?: 'xs' | 'sm' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = bankLogoUrl(code);

  return (
    <span aria-hidden="true" className={cx(styles.logo, styles[size], className)}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh CDN VietQR, không qua next/image
        <img src={url} alt="" className={styles.image} onError={() => setFailed(true)} />
      ) : (
        <span className={styles.initials}>{bankInitials(code)}</span>
      )}
    </span>
  );
}
