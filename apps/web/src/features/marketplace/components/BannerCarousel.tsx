'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { kenBurnsClass } from '@/components/motion/motion-classes';
import { cx } from '@/lib/cx';
import { BannerLink } from '@/features/banners/components/BannerLink';
import type { PublicBanner } from '@/features/banners/types';
import styles from './BannerCarousel.module.css';
import { useTranslations } from 'next-intl';

const ROTATE_MS = 6000;

/**
 * Carousel banner hero — hiển thị toàn bộ dữ liệu từ `/public/banners` (admin quản lý, tối đa 10
 * banner được phép trùng thời gian hiển thị).
 *
 * Tự viết (~100 dòng) thay vì kéo thư viện slider: cần kiểm soát đủ bốn điều kiện DỪNG tự chạy
 * (hover/focus, tab bị ẩn, `prefers-reduced-motion`, chỉ còn 1 slide) và thứ tự tải ảnh
 * (slide đầu eager + fetchpriority cao vì là LCP, slide sau lazy) — những thứ phải ghi đè lằng
 * nhằng trên slider có sẵn.
 *
 * Ảnh hỏng bị LOẠI khỏi vòng quay (không bao giờ hiện khung trống); hỏng hết thì component trả
 * `fallback` (trang chủ truyền khối hero mặc định) — không có thì null.
 */
export function BannerCarousel({
  banners,
  fallback = null,
}: {
  banners: PublicBanner[];
  /** Hiện thay carousel khi MỌI banner đều hỏng ảnh — vỏ ngoài không phải tự đoán chuyện đó. */
  fallback?: ReactNode;
}) {
  const t = useTranslations('Marketplace.banner');
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const slides = banners.filter((b) => !broken.has(b.id));
  const count = slides.length;
  const current = Math.min(index, Math.max(0, count - 1));

  // Tự chạy — dừng khi: hover/focus, tab ẩn, người dùng yêu cầu giảm chuyển động, còn ≤1 slide.
  useEffect(() => {
    if (count <= 1 || paused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return <>{fallback}</>;

  function onTouchEnd(clientX: number) {
    if (touchStartX.current == null) return;
    const delta = clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    setIndex((i) => (i + (delta < 0 ? 1 : -1) + count) % count);
  }

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label={t('carouselLabel')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => onTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
    >
      {/* Khung "thở" chứa mọi slide (không theo từng slide — đổi slide không làm ảnh giật). */}
      <div className={cx(styles.stage, kenBurnsClass)}>
        {slides.map((banner, i) => {
          /*
           * Ba nguồn theo ba slot tỉ lệ chuẩn (xem `banner-media.ts`) — khung chứa cũng đặt
           * `aspect-ratio` đúng các tỉ lệ đó nên ảnh ĐÚNG slot thì chỉ scale, không bao giờ crop.
           * Fallback dần: mobile → tablet → PC (thiếu slot nào thì dùng ảnh gần nhất, chấp nhận
           * crop có kiểm soát về mép trái).
           */
          const tabletSrc = banner.tabletImageUrl ?? banner.imageUrl;
          const mobileSrc = banner.mobileImageUrl ?? tabletSrc;
          const img = (
            // Không dùng next/image: host R2/URL do admin nhập không nằm trong remotePatterns.
            <picture>
              <source media="(max-width: 640px)" srcSet={mobileSrc} />
              <source media="(max-width: 1024px)" srcSet={tabletSrc} />
              <img
                src={banner.imageUrl}
                alt={banner.altText}
                className={styles.image}
                loading={i === 0 ? 'eager' : 'lazy'}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                onError={() => setBroken((prev) => new Set(prev).add(banner.id))}
              />
            </picture>
          );
          return (
            <div
              key={banner.id}
              className={cx(styles.slide, i === current && styles.slideActive)}
              aria-hidden={i !== current}
            >
              <BannerLink
                href={banner.linkUrl}
                className={styles.slideLink}
                tabIndex={i === current ? 0 : -1}
              >
                {img}
              </BannerLink>
            </div>
          );
        })}
      </div>

      {count > 1 ? (
        <div className={styles.dots} role="tablist" aria-label={t('selectLabel')}>
          {slides.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`Banner ${i + 1}: ${banner.altText}`}
              className={cx(styles.dot, i === current && styles.dotActive)}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
