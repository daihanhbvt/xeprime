'use client';

import { PictureOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Skeleton } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '@/services/api-client';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import styles from './FeaturedLocations.module.css';
import { useTranslations } from 'next-intl';

/** Số ô hiện ban đầu; "Xem tất cả" mở hết phần đã tải. */
const PREVIEW_COUNT = 5;
const FETCH_LIMIT = 12;

/**
 * "Địa điểm nổi bật" — tỉnh/thành ĐANG có xe, số xe đếm thật ở backend (`/public/destinations`).
 * Bấm một địa điểm sẽ lọc danh sách gợi ý theo tỉnh đó rồi cuộn xuống.
 */
export function FeaturedLocations() {
  const t = useTranslations('Marketplace.locations');
  const { setFilters } = useMarketplaceFilters();
  const { data, isLoading, isError, error } = useDestinations(FETCH_LIMIT);
  const [expanded, setExpanded] = useState(false);

  function pick(provinceCode: string) {
    // Lọc theo MÃ tỉnh (khớp chính xác). Xoá luôn tham số tên cũ nếu URL đang mang nó.
    setFilters({ provinceCode, province: undefined });
    document.getElementById('recommendations')?.scrollIntoView({ behavior: 'smooth' });
  }

  const all = data ?? [];
  const shown = expanded ? all : all.slice(0, PREVIEW_COUNT);

  // Chưa có xe nào công khai → ẩn hẳn khối, không hiện khung rỗng vô nghĩa.
  if (!isLoading && !isError && all.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="loc-title">
      <header className={styles.head}>
        <div>
          <h2 id="loc-title" className={styles.title}>
            {t('title')}
          </h2>
          <p className={styles.sub}>{t('subtitle')}</p>
        </div>
        {all.length > PREVIEW_COUNT ? (
          <button type="button" className={styles.seeAll} onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('collapse') : t('expand')} <RightOutlined />
          </button>
        ) : null}
      </header>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError')}
          description={getErrorMessage(error)}
        />
      ) : isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
            <div key={i} className={styles.tile}>
              <Skeleton.Node active className={styles.skeleton} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {shown.map((loc) => (
            <button
              key={loc.provinceCode}
              type="button"
              className={styles.tile}
              onClick={() => pick(loc.provinceCode)}
            >
              {loc.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh từ storage ngoài, chưa qua next/image
                <img src={loc.imageUrl} alt="" className={styles.photo} />
              ) : (
                <span className={styles.placeholder} aria-hidden="true">
                  <PictureOutlined />
                </span>
              )}
              <span className={styles.shade} aria-hidden="true" />
              <span className={styles.meta}>
                <span className={styles.name}>{loc.provinceName}</span>
                <span className={styles.count}>{t('available', { count: loc.vehicleCount })}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
