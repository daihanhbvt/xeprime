import { RatingStar, Stars } from '@/components/data-display/Stars';

import { fetchListingReviews } from '../api';
import styles from './ListingReviews.module.css';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';

/**
 * Phần đánh giá công khai của một xe — Server Component (fetch server-side để SEO index được
 * nội dung đánh giá). Tự ẩn khi lỗi/chưa có đánh giá, không làm hỏng cả trang chi tiết.
 */
export async function ListingReviews({ vehicleId }: { vehicleId: string }) {
  const [fmt, t, page] = await Promise.all([
    getAppFormat(),
    getTranslations('Listings.reviews'),
    fetchListingReviews(vehicleId),
  ]);

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('title')}</h2>
        {page && page.summary.ratingCount > 0 ? (
          <div className={styles.summary}>
            {/* Figma `19707:83357`: MỘT sao 20 + điểm 16 semibold + "(n đánh giá)" 14 xám. */}
            <RatingStar size={20} />
            <span className={styles.avg}>{fmt.rating(page.summary.ratingAvg)}</span>
            <span className={styles.count}>
              ({t('count', { count: page.summary.ratingCount })})
            </span>
          </div>
        ) : null}
      </div>

      {!page || page.summary.ratingCount === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <ul className={styles.list}>
          {page.data.map((r) => (
            <li key={r.id} className={styles.item}>
              {/* Figma: avatar 32 + tên 16 semibold (dòng phụ = ngày, ở chỗ "Đã thuê n lần" — API chưa có số
                  đó) · dãy sao 20 bên phải. */}
              <div className={styles.itemHead}>
                <span className={styles.avatar} aria-hidden="true">
                  {r.customerName.trim().charAt(0).toUpperCase()}
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{r.customerName}</span>
                  <span className={styles.date}>{fmt.date(r.createdAt)}</span>
                </span>
                <Stars value={r.rating} size="lg" animated />
              </div>
              {r.comment ? <p className={styles.comment}>{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

