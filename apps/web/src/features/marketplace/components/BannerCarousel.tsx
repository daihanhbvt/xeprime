'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import type { PublicBanner } from '@/features/banners/types';
import styles from './BannerCarousel.module.css';
import { useTranslations } from 'next-intl';

const ROTATE_MS = 6000;

/**
 * Carousel banner hero — dữ liệu từ `/public/banners` (tối đa 3 slide, admin quản lý).
 *
 * Tự viết (~100 dòng) thay vì kéo thư viện slider: cần kiểm soát đủ bốn điều kiện DỪNG tự chạy
 * (hover/focus, tab bị ẩn, `prefers-reduced-motion`, chỉ còn 1 slide) và thứ tự tải ảnh
 * (slide đầu eager + fetchpriority cao vì là LCP, slide sau lazy) — những thứ phải ghi đè lằng
 * nhằng trên slider có sẵn.
 *
 * Ảnh hỏng bị LOẠI khỏi vòng quay (không bao giờ hiện khung trống); hỏng hết thì component trả
 * null để vỏ ngoài rơi về hero mặc định.
 */
export function BannerCarousel({ banners }: { banners: PublicBanner[] }) {
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

  if (count === 0) return null;

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
            {banner.linkUrl ? (
              banner.linkUrl.startsWith('/') ? (
                <Link
                  href={banner.linkUrl}
                  className={styles.slideLink}
                  tabIndex={i === current ? 0 : -1}
                >
                  {img}
                </Link>
              ) : (
                <a
                  href={banner.linkUrl}
                  className={styles.slideLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={i === current ? 0 : -1}
                >
                  {img}
                </a>
              )
            ) : (
              img
            )}
          </div>
        );
      })}

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
