import type { PublicShop } from '../types';
import styles from './ShopHeader.module.css';

function ratingText(shop: PublicShop): string {
  if (shop.ratingCount <= 0) return 'Chưa có đánh giá';
  return `${Number(shop.ratingAvg).toFixed(1)} · ${shop.ratingCount} đánh giá`;
}

/**
 * Đầu trang gian hàng công khai — Server Component (không interactivity, không phụ thuộc antd)
 * để tối ưu SEO: ảnh bìa, logo, tên, tỉnh, điểm đánh giá, giới thiệu, liên hệ. Chỉ dữ liệu công khai.
 */
export function ShopHeader({ shop }: { shop: PublicShop }) {
  const initial = shop.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <header className={styles.header}>
      <div className={styles.coverWrap}>
        {shop.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh bìa từ storage ngoài
          <img src={shop.coverUrl} alt="" className={styles.cover} />
        ) : (
          <div className={styles.coverFallback} aria-hidden="true" />
        )}
      </div>

      <div className={styles.identity}>
        <div className={styles.logo}>
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo từ storage ngoài
            <img src={shop.logoUrl} alt={shop.name} className={styles.logoImg} />
          ) : (
            <span className={styles.logoFallback} aria-hidden="true">
              {initial}
            </span>
          )}
        </div>

        <div className={styles.info}>
          <h1 className={styles.name}>{shop.name}</h1>
          <div className={styles.meta}>
            {shop.provinceName ? (
              <span className={styles.metaItem}>{shop.provinceName}</span>
            ) : null}
            <span className={styles.metaItem}>
              <span className={styles.star} aria-hidden="true">
                ★
              </span>{' '}
              {ratingText(shop)}
            </span>
          </div>
        </div>

        {shop.phone ? (
          <a className={styles.contact} href={`tel:${shop.phone}`}>
            Gọi {shop.phone}
          </a>
        ) : null}
      </div>

      {shop.bio ? <p className={styles.bio}>{shop.bio}</p> : null}
      {shop.address ? <p className={styles.address}>{shop.address}</p> : null}
    </header>
  );
}
