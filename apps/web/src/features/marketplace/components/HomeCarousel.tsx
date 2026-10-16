'use client';

import useEmblaCarousel from 'embla-carousel-react';
import { useTranslations } from 'next-intl';
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './HomeCarousel.module.css';

// Kiểu suy từ chính hook — `embla-carousel` (lõi) không phải phụ thuộc trực tiếp của web.
type EmblaOptions = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;

/** Mobile (≤ 640px): thẻ ở GIỮA, hai thẻ kề ló ra hai bên, vòng lặp — bản vẽ mobile v2. */
const MOBILE_QUERY = '(max-width: 640px)';
/** Từ tablet trở lên ở chế độ `grid`: Embla tắt hẳn, khối trở thành lưới tĩnh (chỉ CSS). */
const GRID_QUERY = '(min-width: 641px)';

/**
 * Băng chuyền của trang chủ v2 (ADR 0062) — Embla Carousel.
 *
 * Embla thay cho cuộn ngang CSS (scroll-snap) từ 16/10/2026: cuộn ngang thuần không KÉO được bằng
 * chuột trên desktop và không có chế độ thẻ-ở-giữa của bản vẽ mobile. Embla lo kéo/vuốt, hoạt
 * cảnh trượt, chặn cú bấm nhầm sau khi kéo và cuộn tới thẻ đang được Tab tới; component này chỉ
 * giữ phần TRÌNH BÀY (bề rộng thẻ theo CSS) và chấm phân trang.
 *
 *   · `perView` — số thẻ mỗi trang ở desktop; tablet tối đa 2 (CSS). Bề rộng thẻ là CSS thuần,
 *     nên HTML server dựng đã đúng hình — không nhảy layout khi Embla gắn vào.
 *   · `layout="grid"` — LƯỚI tĩnh từ 641px trở lên (xe tiêu biểu, địa điểm, banner khuyến mãi),
 *     chỉ là slider trên mobile.
 *   · Desktop trượt theo TRANG (`slidesToScroll: 'auto'`) nên số chấm = số trang; mobile trượt
 *     từng thẻ, canh giữa, vòng lặp.
 *
 * Một trang thì không có chấm: một chấm duy nhất là một nút không dẫn đi đâu.
 */
export function HomeCarousel({
  ariaLabel,
  perView,
  tabletPerView = 2,
  layout = 'carousel',
  gap = 20,
  overhang = false,
  peek = false,
  children,
  className,
}: {
  ariaLabel: string;
  /** Số thẻ mỗi trang ở desktop (≥ 1025px). */
  perView: 2 | 3 | 4;
  /** Số thẻ mỗi trang ở tablet (641–1024px). */
  tabletPerView?: 1 | 2;
  /** `carousel` — slider ở mọi bề rộng. `grid` — lưới tĩnh từ 641px, slider trên mobile. */
  layout?: 'carousel' | 'grid';
  /** Khoảng cách giữa hai thẻ (px) — theo bản vẽ của từng khối. */
  gap?: 20 | 24 | 32;
  /**
   * Thẻ có phần nhô lên khỏi mép trên (ảnh xe của "Gian hàng nổi bật"). Khung trượt cắt cả hai
   * trục, nên phải chừa đệm phía trên — nếu không phần nhô bị xén mất.
   */
  overhang?: boolean;
  /**
   * Thẻ rộng hơn một nửa khung — thẻ thứ hai lộ một phần, báo rằng còn nữa để kéo ("Khách hàng
   * nói gì": thẻ 387px trong cột 722px). Ghi đè `perView` ở desktop.
   */
  peek?: boolean;
  children: ReactNode[];
  className?: string;
}) {
  const t = useTranslations('Home.carousel');
  const options: EmblaOptions = {
    align: 'start',
    containScroll: 'trimSnaps',
    /*
     * Trượt theo TRANG. `peek` (thẻ rộng hơn nửa khung) thì "trang" là HAI thẻ: `auto` chỉ gom
     * những thẻ lọt TRỌN khung — mỗi thẻ thành một trang và băng chuyền 6 đánh giá hiện 6 chấm,
     * trong khi bản vẽ là 3.
     */
    slidesToScroll: peek ? 2 : 'auto',
    breakpoints: {
      [MOBILE_QUERY]: { align: 'center', slidesToScroll: 1, containScroll: false, loop: true },
      ...(layout === 'grid' ? { [GRID_QUERY]: { active: false } } : {}),
    },
  };
  const [viewportRef, api] = useEmblaCarousel(options);
  /*
   * Số trang và trang đang xem ĐỌC thẳng từ Embla (nguồn bên ngoài React) qua
   * `useSyncExternalStore` — không chép sang state riêng có thể lệch khỏi cái người dùng đang thấy.
   * Trước khi Embla gắn vào (HTML server) là 0 trang ⇒ chưa có chấm.
   */
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!api) return () => {};
      api.on('select', notify).on('reInit', notify);
      return () => {
        api.off('select', notify).off('reInit', notify);
      };
    },
    [api],
  );
  const pageCount = useSyncExternalStore(
    subscribe,
    () => api?.scrollSnapList().length ?? 0,
    () => 0,
  );
  const selected = useSyncExternalStore(
    subscribe,
    () => api?.selectedScrollSnap() ?? 0,
    () => 0,
  );

  function goTo(index: number) {
    if (!api) return;
    // Giảm chuyển động: nhảy thẳng tới trang, không trượt.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    api.scrollTo(index, reduced);
  }

  return (
    <div
      className={cx(
        styles.root,
        styles[`per${perView}`],
        tabletPerView === 1 && styles.tablet1,
        styles[`gap${gap}`],
        layout === 'grid' && styles.gridLayout,
        overhang && styles.overhang,
        peek && styles.peek,
        className,
      )}
    >
      <div
        ref={viewportRef}
        className={styles.viewport}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
      >
        <ul className={styles.container}>
          {children.map((child, index) => (
            <li key={index} className={styles.slide}>
              {child}
            </li>
          ))}
        </ul>
      </div>
      {pageCount > 1 ? (
        <div className={styles.dots} role="group" aria-label={t('pagesLabel')}>
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              className={cx(styles.dot, index === selected && styles.dotActive)}
              aria-label={t('pageLabel', { page: index + 1 })}
              aria-current={index === selected ? 'true' : undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
