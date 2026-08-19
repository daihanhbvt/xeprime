'use client';

import type { PublicBanner } from '@/features/banners/types';
import { BannerCarousel } from './BannerCarousel';
import styles from './HomeHero.module.css';
import { useTranslations } from 'next-intl';

/**
 * Vùng hero trang chủ — Figma `18:4`: carousel banner (admin quản lý, tối đa 3); thẻ tìm kiếm
 * do page đặt ĐÈ lên mép dưới (xem `search/SearchCard`). Banner do admin upload TỰ MANG thông điệp
 * nên không phủ tiêu đề lên (h1 vẫn tồn tại cho SEO/screen reader, ẩn thị giác).
 *
 * Không có banner nào đang bật (hoặc API lỗi) → rơi về nền gradient mặc định, GIỮ NGUYÊN chiều
 * cao — trang không nhảy layout và không hiện carousel rỗng.
 */
export function HomeHero({ banners }: { banners: PublicBanner[] }) {
  const t = useTranslations('Marketplace.hero');
  if (banners.length > 0) {
    return (
      <section className={styles.hero}>
        <BannerCarousel banners={banners} />
        {/* Banner thật tự mang thông điệp — KHÔNG phủ tiêu đề lên, hai lớp chữ sẽ đè nhau. */}
        <h1 className={styles.srTitle}>{t('title')}</h1>
      </section>
    );
  }

  return (
    <section className={styles.hero}>
      <div className={styles.fallback} />
      <div className={styles.overlay}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>
          {t('subtitle')}
        </p>
      </div>
    </section>
  );
}
