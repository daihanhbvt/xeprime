import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { PublicBanner } from '@/features/banners/types';
import { BannerCarousel } from './BannerCarousel';
import styles from './HomeHero.module.css';

/**
 * Vùng đầu trang chủ — DẢI BANNER do admin quản lý (`/public/banners`), giữ đúng khổ cũ
 * (PC 1440×300 · tablet 1024×320 · mobile 780×390, `BANNER_SLOTS`). Quyết định 16/10/2026: khi ráp
 * design v2 (ADR 0062) phần banner giữ như trước, không thành nền của một hero có chữ đè lên.
 *
 * Banner tự mang thông điệp nên trang KHÔNG phủ chữ lên ảnh; h1 vẫn có cho SEO/trình đọc màn hình
 * (ẩn thị giác). Thẻ tìm kiếm do page đặt ĐÈ lên mép dưới dải banner ở desktop (`search/SearchCard`).
 *
 * Chưa có banner nào, hoặc ảnh của mọi banner đều hỏng ⇒ khối mặc định CÙNG KHỔ: ảnh nền + tiêu đề
 * của design v2. Có hay không có banner, trang không đổi hình dạng.
 */
export async function HomeHero({ banners }: { banners: PublicBanner[] }) {
  const t = await getTranslations('Home.hero');

  const fallback = (
    <div className={styles.fallback}>
      <Image
        src="/home/hero-fallback.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className={styles.fallbackImage}
      />
      <span className={styles.fog} aria-hidden="true" />
      <div className={styles.overlay} aria-hidden="true">
        <p className={styles.title}>
          <span className={styles.titleLead}>{t('title')}</span>{' '}
          <span className={styles.titleAccent}>{t('titleAccent')}</span>
        </p>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </div>
    </div>
  );

  return (
    <section className={styles.hero}>
      <h1 className={styles.srTitle}>
        {t('title')} {t('titleAccent')}
      </h1>
      {banners.length > 0 ? <BannerCarousel banners={banners} fallback={fallback} /> : fallback}
    </section>
  );
}
