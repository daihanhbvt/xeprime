'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BannerLink } from '@/features/banners/components/BannerLink';
import type { PublicBanner } from '@/features/banners/types';
import { cx } from '@/lib/cx';
import { HomeCarousel } from './HomeCarousel';
import styles from './PromoBanners.module.css';

/**
 * Banner KHUYẾN MÃI giữa trang chủ (design v2, ADR 0062) — do admin quản lý ở trang "Banner trang
 * chủ" › tab "Banner khuyến mãi" (\`marketplace_banners.placement = promo\`), không còn gán cứng.
 *
 * Chữ, giá và hình nằm sẵn trong ảnh (như dải banner đầu trang): trang không đặt gì đè lên, nên
 * không có câu nào phải dịch ở đây ngoài nhãn của khối. Khung giữ đúng tỉ lệ slot
 * (\`PROMO_BANNER_SLOTS\`) nên ảnh đúng cỡ chỉ scale, không bị cắt.
 *
 * Slider ở mọi bề rộng: máy tính và tablet vừa đủ hai banner một hàng (đúng bản vẽ), mobile trượt
 * thẻ-ở-giữa. Ảnh hỏng bị loại khỏi slider; hỏng hết thì cả khối biến mất — page đã không dựng khối
 * khi chưa có banner nào.
 */
export function PromoBanners({ banners }: { banners: PublicBanner[] }) {
  const t = useTranslations('Home.promos');
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const visible = banners.filter((banner) => !broken.has(banner.id));
  if (visible.length === 0) return null;

  return (
    <section aria-label={t('label')}>
      <HomeCarousel ariaLabel={t('label')} perView={2} gap={32}>
        {visible.map((banner) => (
          <BannerLink key={banner.id} href={banner.linkUrl} className={styles.link}>
            {/* Không dùng next/image: host R2/URL do admin nhập không nằm trong remotePatterns. */}
            <picture className={cx(styles.card, banner.mobileImageUrl && styles.hasMobile)}>
              {banner.mobileImageUrl ? (
                <source media="(max-width: 640px)" srcSet={banner.mobileImageUrl} />
              ) : null}
              <img
                src={banner.imageUrl}
                alt={banner.altText}
                loading="lazy"
                className={styles.image}
                onError={() => setBroken((prev) => new Set(prev).add(banner.id))}
              />
            </picture>
          </BannerLink>
        ))}
      </HomeCarousel>
    </section>
  );
}
