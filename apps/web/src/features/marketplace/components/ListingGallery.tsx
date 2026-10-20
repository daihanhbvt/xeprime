'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { cx } from '@/lib/cx';
import styles from './ListingGallery.module.css';

/** Số ảnh của khảm PC: 1 ảnh chính + 4 ảnh nhỏ. */
const MOSAIC_SIZE = 5;
/** Quá số này thì chấm chỉ còn là "3 / 12" — một hàng 20 chấm không còn bấm trúng được. */
const MAX_DOTS = 8;

/**
 * Gallery của trang chi tiết listing — MỘT danh sách ảnh, hai cách bày:
 *
 * - PC (Figma `19707:83366`): khảm 1200 × 309 — ảnh chính 650px bên trái, 2 cột ảnh nhỏ bên phải,
 *   ô thứ năm phủ "+N" khi còn ảnh. Ít hơn 5 ảnh thì ảnh nhỏ giãn ra lấp chỗ (xem CSS `data-count`).
 * - Mobile (Figma `19771:71515`): ảnh trượt ngang từng tấm (358 × 170, bo 12) + hàng chấm bên dưới,
 *   chấm đang xem là viên thuốc 24 × 8.
 *
 * Mọi ảnh nằm trong cùng một `PreviewImageGroup`, nên bấm ảnh nào cũng mở chung một trình xem với
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
    return (first?.offsetWidth ?? track.clientWidth) + gap;
  }, []);

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.round(track.scrollLeft / slideStep(track));
    setActive(Math.min(Math.max(next, 0), total - 1));
  };

  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * slideStep(track), behavior: 'smooth' });
  };

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

      {/* Chỉ bản mobile có hàng chấm — PC đã thấy cùng lúc 5 ảnh. */}
      {total > 1 ? (
        total <= MAX_DOTS ? (
          <div className={styles.pager} role="group" aria-label={t('pager')}>
            {allImages.map((url, index) => (
              <button
                key={`${index}:${url}`}
                type="button"
                className={cx(styles.dot, index === active && styles.dotActive)}
                aria-label={t('goTo', { index: index + 1, total })}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
        ) : (
          <p className={cx(styles.pager, styles.counter)} aria-live="polite">
            {t('counter', { index: active + 1, total })}
          </p>
        )
      ) : null}
    </div>
  );
}
