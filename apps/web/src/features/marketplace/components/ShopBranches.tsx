import Image from 'next/image';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import type { PublicShop } from '../types';
import styles from './ShopBranches.module.css';

/**
 * "Chi nhánh" của trang gian hàng — Figma `20063:59234`. Server Component: danh sách chi nhánh
 * đang GIỮ xe công khai, mỗi ô là tên + số xe + điểm.
 *
 * Chỉ những chi nhánh có xe hiện trên chợ (backend gộp từ `public_listings`), nên ô nào cũng có
 * ít nhất một xe để thuê — chi nhánh trống không có gì để khách làm ở đây. Điểm là trung bình có
 * trọng số theo số đánh giá; chưa có đánh giá thì ô điểm biến mất, không hiện 0.
 *
 * Danh sách chi nhánh của một gian hàng là hữu hạn và nhỏ (mỗi chi nhánh là một địa điểm kinh
 * doanh), nên không phân trang.
 */
export async function ShopBranches({ branches }: { branches: PublicShop['branches'] }) {
  if (branches.length === 0) return null;
  const [t, fmt] = await Promise.all([getTranslations('Shops.branches'), getAppFormat()]);

  return (
    <section className={styles.section} aria-labelledby="shop-branches-title">
      <h2 id="shop-branches-title" className={styles.title}>
        {t('title')}
      </h2>
      <ul className={styles.list}>
        {branches.map((branch) => {
          const rating = branch.ratingAvg === null ? null : Number(branch.ratingAvg);
          return (
            <li key={branch.id} className={styles.item}>
              <span className={styles.icon} aria-hidden="true">
                <Image src="/shops/map.svg" alt="" width={16} height={14} unoptimized />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{branch.name}</span>
                <span className={styles.sub}>
                  {t('vehicles', { count: branch.vehicleCount })}
                  {branch.provinceName && !branch.name.includes(branch.provinceName)
                    ? ` · ${branch.provinceName}`
                    : null}
                </span>
              </span>
              {rating !== null && Number.isFinite(rating) ? (
                <span
                  className={styles.rating}
                  aria-label={t('rating', { rating: fmt.rating(rating) })}
                >
                  <span aria-hidden="true">{fmt.rating(rating)}</span>
                  <Image src="/shops/star-16.svg" alt="" width={16} height={16} unoptimized />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
