import { STOREFRONT_KIND } from '@xeprime/types';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import type { PublicShop } from '../types';
import { HostMetrics } from './HostMetrics';
import styles from './ShopAbout.module.css';

/**
 * Khối "giới thiệu + số liệu" của trang gian hàng — Server Component.
 *
 * ## Vì sao số liệu đứng CẠNH phần giới thiệu chứ không thành một dải riêng
 *
 * Giới thiệu là thứ gian hàng TỰ NÓI về mình; số liệu là thứ hệ thống ĐẾM được. Đặt chúng cạnh
 * nhau trên cùng một thẻ để người đọc đối chiếu ngay — một đoạn giới thiệu hùng hồn bên cạnh
 * "0 chuyến hoàn thành" tự nói lên điều cần nói, và đó là tính năng chứ không phải lỗi bố cục.
 *
 * ## Ô nào vắng dữ liệu thì BIẾN MẤT, không hiện số 0
 *
 * Điểm đánh giá khi chưa ai đánh giá không phải "0 sao". Lấp chỗ trống bằng số 0 là bịa ra một
 * lời khẳng định xấu về một gian hàng mới mở.
 *
 * ## Ba chỉ số UY TÍN tách khỏi lưới số liệu này
 *
 * Bốn ô ở đây là những thứ ĐẾM ĐƯỢC không cần diễn giải (bao nhiêu xe, bao nhiêu chuyến). Ba
 * chỉ số của ADR 0045 thì mỗi con số cần một định nghĩa mẫu số đi kèm, và chúng dùng chung một
 * ngưỡng "đủ dữ liệu" — trộn vào cùng lưới sẽ có ô biến mất ô còn, trông như lỗi hiển thị.
 * `HostMetrics` vì thế là một khối riêng, dùng chung với trang chi tiết xe.
 */
export async function ShopAbout({ shop }: { shop: PublicShop }) {
  const [t, fmt] = await Promise.all([getTranslations('Shops'), getAppFormat()]);
  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const rating = Number(shop.ratingAvg);

  const stats = [
    { key: 'vehicles', value: fmt.count(shop.vehicleCount), label: t('stats.vehicles') },
    {
      key: 'completedTrips',
      value: fmt.count(shop.completedTripCount),
      label: t('stats.completedTrips'),
    },
    shop.ratingCount > 0 && Number.isFinite(rating)
      ? { key: 'rating', value: fmt.rating(rating), label: t('stats.rating') }
      : null,
  ].filter((stat): stat is { key: string; value: string; label: string } => stat !== null);

  return (
    <section className={styles.section}>
      <div className={styles.card}>
        {/*
          Cột trái luôn có mặt vì `HostMetrics` luôn có điều để nói — ít nhất là "chưa đủ dữ
          liệu, mới có N yêu cầu". Một gian hàng chưa viết giới thiệu vẫn là một gian hàng khách
          cần đọc được ba chỉ số.
        */}
        <div className={styles.about}>
          <h2 className={styles.title}>{t(isShop ? 'about.titleShop' : 'about.titlePersonal')}</h2>
          {shop.bio ? <p className={styles.bio}>{shop.bio}</p> : null}
          {shop.address ? (
            <p className={styles.address}>{t('about.address', { address: shop.address })}</p>
          ) : null}
          <HostMetrics metrics={shop.metrics} className={styles.metrics} />
        </div>

        {stats.length > 0 ? (
          <ul className={styles.stats} aria-label={t('stats.sectionLabel')}>
            {stats.map((stat) => (
              <li key={stat.key} className={styles.stat}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
