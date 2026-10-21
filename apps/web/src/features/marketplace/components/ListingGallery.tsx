'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { cx } from '@/lib/cx';
import styles from './ListingGallery.module.css';

/** Số ảnh của khảm PC: 1 ảnh chính + 4 ảnh nhỏ. */
const MOSAIC_SIZE = 5;

/**
 * Gallery của trang chi tiết listing — MỘT danh sách ảnh, hai cách bày:
 *
 * - PC (Figma `19707:83366`): khảm 1200 × 309 — ảnh chính 650px bên trái, 2 cột ảnh nhỏ bên phải,
 *   ô thứ năm phủ "+N" khi còn ảnh. Ít hơn 5 ảnh thì ảnh nhỏ giãn ra lấp chỗ (xem CSS `data-count`).
 * - Mobile (Figma `19771:71515`): ảnh trượt ngang từng tấm (358 × 170, bo 12), bộ đếm "n / N" ở góc
 *   ảnh + dải ảnh nhỏ 4:3 bên dưới — 5 ô vừa khít bề rộng nội dung, kẹp 56–88px (khớp app native `ListingGalleryThumbs`): bấm ảnh nhỏ nhảy tới
 *   tấm đó; trượt ảnh chính thì ảnh nhỏ đang xem sáng viền và tự cuộn vào tầm nhìn.
 *
 * Mọi ảnh lớn nằm trong cùng một `PreviewImageGroup`, nên bấm ảnh nào cũng mở chung một trình xem với
 * đủ bộ ảnh — không có bản sao thứ hai của danh sách cho mobile.
 */
export function ListingGallery({
  name,
  mainImageUrl,
  images,
}: {
  name: string;
  mainImageUrl?: string | null;
  images: string[];
}) {
  const t = useTranslations('Listings.detail.gallery');
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Ảnh chính đứng đầu, rồi các ảnh phụ không trùng.
  const allImages = [
    ...(mainImageUrl ? [mainImageUrl] : []),
    ...images.filter((img) => img !== mainImageUrl),
  ];
  const total = allImages.length;
  const extraCount = total > MOSAIC_SIZE ? total - MOSAIC_SIZE : 0;

  /** Bước trượt = bề rộng một tấm + khe — đọc từ DOM vì khe là của CSS. */
  const slideStep = useCallback((track: HTMLDivElement) => {
    const first = track.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    return (first?.offsetWidth ?? track.clientWidth) + gap || 1;
  }, []);

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.round(track.scrollLeft / slideStep(track));
    setActive(Math.min(Math.max(next, 0), total - 1));
  };

  const goTo = (index: number) => {
    setActive(index);
    const track = trackRef.current;
    if (!track || typeof track.scrollTo !== 'function') return;
    track.scrollTo({ left: index * slideStep(track), behavior: 'smooth' });
  };

  // Giữ ảnh nhỏ đang xem trong tầm nhìn — cuộn RIÊNG dải ảnh, không dùng `scrollIntoView` (nó cuộn
  // cả trang theo chiều dọc).
  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !thumb || typeof strip.scrollTo !== 'function') return;
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(left, 0), behavior: 'smooth' });
  }, [active]);

  if (total === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.grid} data-count="1">
          <div className={styles.slide}>
            <div className={styles.placeholder} aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.viewport}>
        <PreviewImageGroup>
          <div
            ref={trackRef}
            className={styles.grid}
            data-count={Math.min(total, MOSAIC_SIZE)}
            onScroll={handleScroll}
          >
            {allImages.map((url, index) => (
              <div key={`${index}:${url}`} className={styles.slide}>
                <PreviewImage
                  src={url}
                  alt={index === 0 ? name : t('photoAlt', { name, index: index + 1 })}
                  className={styles.photo}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
                {index === MOSAIC_SIZE - 1 && extraCount > 0 ? (
                  <div className={styles.overlay} aria-hidden="true">
                    <span>+{extraCount}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </PreviewImageGroup>

        {/* Bộ đếm + dải ảnh nhỏ chỉ hiện ở mobile — PC đã thấy cùng lúc 5 ảnh. */}
        {total > 1 ? (
          <p className={styles.counter} aria-live="polite">
            {t('counter', { index: active + 1, total })}
          </p>
        ) : null}
      </div>

      {total > 1 ? (
        <div ref={thumbsRef} className={styles.thumbs} role="group" aria-label={t('pager')}>
          {allImages.map((url, index) => (
            <button
              key={`${index}:${url}`}
              type="button"
              className={cx(styles.thumb, index === active && styles.thumbActive)}
              aria-label={t('goTo', { index: index + 1, total })}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => goTo(index)}
            >
              {/* Ảnh từ nhiều nguồn (R2/CDN) chưa khai `images.remotePatterns` ⇒ `unoptimized`. */}
              <Image
                src={url}
                alt=""
                width={88}
                height={66}
                sizes="88px"
                unoptimized
                loading="lazy"
                className={styles.thumbImage}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
