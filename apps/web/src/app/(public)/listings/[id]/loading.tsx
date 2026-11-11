import { getTranslations } from 'next-intl/server';
import feedbackStyles from '@/components/feedback/LoadingState.module.css';
import styles from './loading.module.css';

/**
 * Khung chờ của trang chi tiết xe.
 *
 * Root layout là `force-dynamic` nên mỗi lượt mở xe phải đợi server render xong. Không có ranh giới
 * `loading` thì trình duyệt ĐỨNG YÊN ở trang danh sách suốt lúc đó (người dùng thấy cú bấm "khựng"
 * 1-3s). Có file này: Next prefetch sẵn khung, bấm là chuyển ngay, nội dung stream vào sau.
 *
 * Bố cục đã biết trước ⇒ skeleton (quy ước `LoadingState`): bọc `role="status"` + nhãn chỉ cho trình
 * đọc màn hình. Hình dạng theo `ListingDetailView`: đường dẫn → dải ảnh → lưới 2 cột.
 */
export default async function ListingDetailLoading() {
  const t = await getTranslations('Common.states');
  return (
    <div className={styles.wrap} role="status" aria-busy="true" aria-live="polite">
      <span className={feedbackStyles.srOnly}>{t('loading')}</span>
      <div className={`${styles.bone} ${styles.breadcrumb}`} />
      <div className={`${styles.bone} ${styles.gallery}`} />
      <div className={styles.layout}>
        <div className={styles.leftCol}>
          <div className={`${styles.bone} ${styles.title}`} />
          <div className={`${styles.bone} ${styles.line}`} />
          <div className={styles.specs}>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={`${styles.bone} ${styles.spec}`} />
            ))}
          </div>
          <div className={`${styles.bone} ${styles.block}`} />
        </div>
        <div className={`${styles.bone} ${styles.card}`} />
      </div>
    </div>
  );
}
