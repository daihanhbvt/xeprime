'use client';

import { RightOutlined, StarFilled } from '@ant-design/icons';
import { Alert, Skeleton } from 'antd';
import Link from 'next/link';
import { shopPath } from '@/constants/routes';
import { getErrorMessage } from '@/services/api-client';
import { useFeaturedShops } from '../hooks/use-featured-shops';
import type { PublicShopSummary } from '../types';
import styles from './FeaturedHosts.module.css';

// Figma `18:4`: đúng MỘT hàng 4 gian hàng — nhiều hơn là thành danh bạ, không còn là "nổi bật".
const LIMIT = 4;

/**
 * "Gian hàng nổi bật" — shop đang hoạt động có xe công khai, sắp theo điểm đánh giá
 * (`/public/shops`). Điểm và số xe đều từ backend, không biên tập tay.
 */
export function FeaturedHosts() {
  const { data, isLoading, isError, error } = useFeaturedShops(LIMIT);
  const shops = data?.shops ?? [];

  // Chưa có gian hàng nào đủ điều kiện → ẩn khối.
  if (!isLoading && !isError && shops.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="hosts-title">
      <header className={styles.head}>
        <div>
          <h2 id="hosts-title" className={styles.title}>
            Gian hàng nổi bật
          </h2>
          <p className={styles.sub}>Những chủ xe được khách đánh giá cao</p>
        </div>
      </header>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được gian hàng"
          description={getErrorMessage(error)}
        />
      ) : isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.card}>
              <Skeleton active avatar paragraph={false} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {shops.map((shop) => (
            <HostCard key={shop.slug} shop={shop} />
          ))}
        </div>
      )}
    </section>
  );
}

function HostCard({ shop }: { shop: PublicShopSummary }) {
  const meta = [`${shop.vehicleCount} xe`, shop.provinceName].filter(Boolean).join(' · ');
  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  return (
    <Link href={shopPath.detail(shop.slug)} className={styles.card}>
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo từ storage ngoài, chưa qua next/image
        <img src={shop.logoUrl} alt="" className={styles.logo} />
      ) : (
        <span className={styles.logoFallback} aria-hidden="true">
          {initials(shop.name)}
        </span>
      )}

      <span className={styles.body}>
        <span className={styles.name}>{shop.name}</span>
        <span className={styles.meta}>{meta}</span>
      </span>

      {hasRating ? (
        <span className={styles.rating}>
          <StarFilled className={styles.star} /> {rating.toFixed(1)}
        </span>
      ) : (
        <span className={styles.newTag}>Mới</span>
      )}
      <RightOutlined className={styles.chevron} />
    </Link>
  );
}

/** Chữ cái đầu của tối đa 2 từ — dùng khi gian hàng chưa có logo. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}
