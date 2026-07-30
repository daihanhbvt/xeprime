'use client';

import { useState } from 'react';
import { vehicleBrandKey } from '@xeprime/types';
import styles from './BrandMark.module.css';

/**
 * Logo hãng xe cho chip bộ lọc: thử `/brands/{key}.svg` (key suy từ tên hãng qua
 * `vehicleBrandKey`), file không có thì fallback monogram chữ cái đầu — hãng lạ do shop tự
 * nhập vẫn hiển thị tử tế, thêm logo mới chỉ là thả file SVG vào `public/brands/`.
 */
export function BrandMark({ brand }: { brand: string }) {
  const [failed, setFailed] = useState(false);
  const key = vehicleBrandKey(brand);

  if (failed || !key) {
    return (
      <span className={styles.monogram} aria-hidden="true">
        {brand.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh trong public/, không cần next/image
    <img
      src={`/brands/${key}.svg`}
      alt=""
      aria-hidden="true"
      className={styles.logo}
      onError={() => setFailed(true)}
    />
  );
}
