import { Stars } from '@/components/data-display/Stars';
import { formatDate } from '@/lib/datetime';
import { fetchListingReviews } from '../api';
import styles from './ListingReviews.module.css';

/**
 * Phần đánh giá công khai của một xe — Server Component (fetch server-side để SEO index được
 * nội dung đánh giá). Tự ẩn khi lỗi/chưa có đánh giá, không làm hỏng cả trang chi tiết.
 */
export async function ListingReviews({ vehicleId }: { vehicleId: string }) {
  const page = await fetchListingReviews(vehicleId);

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>Đánh giá</h2>
        {page && page.summary.ratingCount > 0 ? (
          <div className={styles.summary}>
            <span className={styles.avg}>{page.summary.ratingAvg.toFixed(1)}</span>
            <Stars value={page.summary.ratingAvg} />
            <span className={styles.count}>{page.summary.ratingCount} đánh giá</span>
          </div>
        ) : null}
      </div>

      {!page || page.summary.ratingCount === 0 ? (
        <p className={styles.empty}>Chưa có đánh giá cho xe này.</p>
      ) : (
        <ul className={styles.list}>
          {page.data.map((r) => (
            <li key={r.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.name}>{r.customerName}</span>
                <Stars value={r.rating} size="sm" />
                <span className={styles.date}>{formatDate(r.createdAt)}</span>
              </div>
              {r.comment ? <p className={styles.comment}>{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
