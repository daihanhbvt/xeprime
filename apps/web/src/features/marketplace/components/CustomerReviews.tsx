'use client';

import { Alert, Skeleton } from 'antd';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useFeaturedReviews } from '../hooks/use-featured-reviews';
import type { FeaturedReview } from '../types';
import { HomeCarousel } from './HomeCarousel';
import { SectionHeading } from './SectionHeading';
import styles from './CustomerReviews.module.css';

/** Ba trang băng chuyền (thẻ 387px, khung 722px). Trần của server là 12. */
const LIMIT = 6;
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * "Đánh giá — Khách hàng nói gì về XePrime" (design v2 `19695:40832`, ADR 0062).
 *
 * Lời nhận xét THẬT, đã công khai, do server chọn (`/public/reviews/featured`). Chưa có đánh giá
 * nào đủ điều kiện thì ẩn cả cột — trang chủ không dựng câu trích dẫn mẫu.
 */
export function CustomerReviews({ className }: { className?: string }) {
  const t = useTranslations('Home.reviews');
  const errorMessage = useErrorMessage();
  const { data, isLoading, isError, error } = useFeaturedReviews(LIMIT);
  const reviews = data ?? [];

  if (!isLoading && !isError && reviews.length === 0) return null;

  return (
    <section className={cx(styles.section, className)} aria-labelledby="home-reviews">
      <SectionHeading id="home-reviews" kicker={t('kicker')} title={t('title')} />

      {isError ? (
        <Alert type="error" showIcon title={t('loadError')} description={errorMessage(error)} />
      ) : isLoading ? (
        <div className={styles.skeletonRow} aria-busy="true">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className={styles.card}>
              <Skeleton active avatar={{ size: 32 }} paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      ) : (
        <HomeCarousel ariaLabel={t('title')} perView={2} peek>
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </HomeCarousel>
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: FeaturedReview }) {
  const t = useTranslations('Home.reviews');
  const fmt = useAppFormat();

  return (
    <figure className={styles.card}>
      <span
        className={styles.stars}
        role="img"
        aria-label={t('ratingAria', { rating: fmt.rating(review.rating) })}
      >
        {STARS.map((n) => (
          <Image
            key={n}
            src="/home/star-24.svg"
            alt=""
            width={24}
            height={24}
            unoptimized
            className={cx(styles.star, n > review.rating && styles.starEmpty)}
          />
        ))}
      </span>
      <Image src="/home/quote.svg" alt="" width={20} height={20} unoptimized aria-hidden="true" />
      <blockquote className={styles.comment}>{review.comment}</blockquote>
      <figcaption className={styles.reviewer}>
        <span className={styles.avatar} aria-hidden="true">
          {initialOf(review.customerName)}
        </span>
        <span className={styles.reviewerText}>
          <span className={styles.name}>{review.customerName}</span>
          {review.customerTripCount > 0 ? (
            <span className={styles.trips}>
              {t('rentedTimes', { count: review.customerTripCount })}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}
