import type { PublicShop } from '../types';
import styles from './ShopHeader.module.css';
import { getTranslations } from 'next-intl/server';
import { getAppFormat } from '@/i18n/server-format';



/**
 * Đầu trang gian hàng công khai — Server Component (không interactivity, không phụ thuộc antd)
 * để tối ưu SEO: ảnh bìa, logo, tên, tỉnh, điểm đánh giá, giới thiệu, liên hệ. Chỉ dữ liệu công khai.
 */
export async function ShopHeader({ shop }: { shop: PublicShop }) {
  const [t, fmt] = await Promise.all([getTranslations('Shops.header'), getAppFormat()]);
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
              {shop.ratingCount > 0
                ? t('rating', { avg: fmt.rating(Number(shop.ratingAvg)), count: shop.ratingCount })
                : t('noRating')}
            </span>
          </div>
        </div>

        {shop.phone ? (
          <a className={styles.contact} href={`tel:${shop.phone}`}>
            {t('call', { phone: shop.phone })}
          </a>
        ) : null}
      </div>

      {shop.bio ? <p className={styles.bio}>{shop.bio}</p> : null}
      {shop.address ? <p className={styles.address}>{shop.address}</p> : null}
    </header>
  );
}
