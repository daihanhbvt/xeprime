'use client';

import { PictureOutlined } from '@ant-design/icons';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { FEATURED_LOCATIONS } from '../constants';
import styles from './FeaturedLocations.module.css';

/**
 * Địa điểm nổi bật — bám xeprime.vn. Bấm một thành phố sẽ lọc danh sách gợi ý và cuộn xuống.
 * Ảnh dùng placeholder cho tới khi có asset thật.
 */
export function FeaturedLocations() {
  const { setFilters } = useMarketplaceFilters();

  function pick(province: string) {
    // TODO(Phase 3): backend lọc theo `province` khi public_listings có cột đó. Hiện chỉ cuộn.
    setFilters({});
    document.getElementById('recommendations')?.scrollIntoView({ behavior: 'smooth' });
    void province;
  }

  return (
    <section className={styles.section} aria-labelledby="loc-title">
      <header className={styles.head}>
        <div>
          <h2 id="loc-title" className={styles.title}>
            Địa điểm nổi bật
          </h2>
          <p className={styles.sub}>Khám phá xe thuê tại các điểm đến phổ biến</p>
        </div>
      </header>

      <div className={styles.grid}>
        {FEATURED_LOCATIONS.map((loc, i) => (
          <button
            key={loc.province}
            type="button"
            className={i === 0 || i === 4 ? styles.tileWide : styles.tile}
            onClick={() => pick(loc.province)}
          >
            <span className={styles.overlay} aria-hidden="true">
              <PictureOutlined />
            </span>
            <span className={styles.meta}>
              <span className={styles.name}>{loc.name}</span>
              <span className={styles.count}>{loc.count} xe có sẵn</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
