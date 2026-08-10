'use client';

import { PictureOutlined, RightOutlined } from '@ant-design/icons';
import { Alert, Skeleton } from 'antd';
import { useState } from 'react';
import { getErrorMessage } from '@/services/api-client';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import styles from './FeaturedLocations.module.css';

/** Số ô hiện ban đầu; "Xem tất cả" mở hết phần đã tải. */
const PREVIEW_COUNT = 5;
const FETCH_LIMIT = 12;

/**
 * "Địa điểm nổi bật" — tỉnh/thành ĐANG có xe, số xe đếm thật ở backend (`/public/destinations`).
 * Bấm một địa điểm sẽ lọc danh sách gợi ý theo tỉnh đó rồi cuộn xuống.
 */
export function FeaturedLocations() {
  const { setFilters } = useMarketplaceFilters();
  const { data, isLoading, isError, error } = useDestinations(FETCH_LIMIT);
  const [expanded, setExpanded] = useState(false);

  function pick(provinceName: string) {
    // Lọc theo tên tỉnh (khớp `provinceName`, backend so contains-insensitive).
    setFilters({ province: provinceName });
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
            Địa điểm nổi bật
          </h2>
          <p className={styles.sub}>Khám phá xe thuê tại các điểm đến phổ biến</p>
        </div>
        {all.length > PREVIEW_COUNT ? (
          <button type="button" className={styles.seeAll} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Thu gọn' : 'Xem tất cả'} <RightOutlined />
          </button>
        ) : null}
      </header>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được địa điểm"
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
              key={loc.provinceName}
              type="button"
              className={styles.tile}
              onClick={() => pick(loc.provinceName)}
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
                <span className={styles.count}>{loc.vehicleCount} xe có sẵn</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
