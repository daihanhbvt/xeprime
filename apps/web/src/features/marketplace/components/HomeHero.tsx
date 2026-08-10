'use client';

import type { PublicBanner } from '@/features/banners/types';
import { BannerCarousel } from './BannerCarousel';
import styles from './HomeHero.module.css';

/**
 * Vùng hero trang chủ — Figma `18:4`: carousel banner (admin quản lý, tối đa 3); thẻ tìm kiếm
 * do page đặt ĐÈ lên mép dưới (xem `HeroSearch`). Banner do admin upload TỰ MANG thông điệp
 * nên không phủ tiêu đề lên (h1 vẫn tồn tại cho SEO/screen reader, ẩn thị giác).
 *
 * Không có banner nào đang bật (hoặc API lỗi) → rơi về nền gradient mặc định, GIỮ NGUYÊN chiều
 * cao — trang không nhảy layout và không hiện carousel rỗng.
 */
export function HomeHero({ banners }: { banners: PublicBanner[] }) {
  if (banners.length > 0) {
    return (
      <section className={styles.hero}>
        <BannerCarousel banners={banners} />
        {/* Banner thật tự mang thông điệp — KHÔNG phủ tiêu đề lên, hai lớp chữ sẽ đè nhau. */}
        <h1 className={styles.srTitle}>Tìm xe cho thuê phù hợp nhất</h1>
      </section>
    );
  }

  return (
    <section className={styles.hero}>
      <div className={styles.fallback} />
      <div className={styles.overlay}>
        <h1 className={styles.title}>Tìm xe cho thuê phù hợp nhất</h1>
        <p className={styles.subtitle}>
          Hàng nghìn xe ô tô và xe máy từ các gian hàng uy tín trên toàn quốc
        </p>
      </div>
    </section>
  );
}
