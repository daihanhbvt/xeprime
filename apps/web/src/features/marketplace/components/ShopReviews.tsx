import Link from 'next/link';
import { Stars } from '@/components/data-display/Stars';
import { listingPath } from '@/constants/routes';
import { initialOf } from '@/lib/initials';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import { fetchShopReviews } from '../api';
import styles from './ShopReviews.module.css';

/**
 * "Đánh giá từ khách hàng" trên trang gian hàng — Server Component, fetch ở server để nội dung
 * đánh giá được công cụ tìm kiếm index (cùng lý do `ListingReviews` làm vậy ở trang xe).
 *
 * Chỉ trang ĐẦU: đây là bằng chứng xã hội để khách quyết định, không phải kho lưu trữ. Ai muốn
 * đọc hết đánh giá của một chiếc xe thì đi qua chính chiếc xe đó — mỗi thẻ ở đây là một liên kết
 * tới nó, và đó cũng là câu trả lời cho "4 sao này là của xe nào".
 *
 * Lỗi mạng ⇒ khối tự ẩn thay vì làm hỏng cả trang gian hàng: người ta tới đây để xem xe.
 */
const REVIEW_LIMIT = 6;

export async function ShopReviews({ slug }: { slug: string }) {
  const [t, fmt, page] = await Promise.all([
    getTranslations('Shops.reviews'),
    getAppFormat(),
    fetchShopReviews(slug, REVIEW_LIMIT),
  ]);

  if (!page) return null;

  const total = page.meta.total;

  return (
    <section className={styles.section} aria-label={t('sectionLabel')}>
      <h2 className={styles.title}>
        {total > 0 ? t('titleWithCount', { count: total }) : t('title')}
      </h2>

      {page.data.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <ul className={styles.list}>
          {page.data.map((review) => (
            <li key={review.id} className={styles.item}>
              <div className={styles.head}>
                {/*
                  Avatar dựng từ chữ cái đầu chứ không phải ảnh thật của khách: `customerName` đã
                  được backend rút gọn ("Nguyễn Văn A.") để trang công khai không phơi danh tính
                  người thuê, và dán ảnh của họ cạnh cái tên đã che là tự cởi bỏ lớp che đó.
                */}
                <span className={styles.avatar} aria-hidden="true">
                  {initialOf(review.customerName)}
                </span>
                <div className={styles.who}>
                  <span className={styles.name}>{review.customerName}</span>
                  <span className={styles.date}>{fmt.date(review.createdAt)}</span>
                </div>
                <Stars value={review.rating} size="sm" />
              </div>

              {review.comment ? <p className={styles.comment}>{review.comment}</p> : null}

              <Link href={listingPath.detail(review.vehicleId)} className={styles.vehicle}>
                {t('vehicle', { name: review.vehicleName })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
