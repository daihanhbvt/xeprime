'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App, Button, Input, Rate } from 'antd';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { RATING_MAX, RATING_MIN, REVIEW_COMMENT_MAX } from '@xeprime/types';
import { Stars } from '@/components/data-display/Stars';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useCreateReview } from '@/features/reviews/hooks/use-create-review';
import { useUpdateReview } from '@/features/reviews/hooks/use-update-review';
import { useErrorMessage } from '@/i18n/use-error-message';
import { buildReviewSchema, type ReviewFormValues } from '../review-schema';
import type { CustomerTripDetail } from '../types';
import layout from './TripRequestLayout.module.css';
import styles from './TripReviewCard.module.css';

/**
 * "Đánh giá chuyến đi" đầu cột phải của chuyến đã hoàn tất — Figma `21621:68041` (chưa đánh giá:
 * năm sao + ô nhận xét + "Gửi đánh giá") và `21621:68560` (đã đánh giá: sao + lời nhận xét).
 *
 * Server quyết: `canReview` mở form (chuyến hoàn thành, chưa đánh giá), `review` là bản đã gửi.
 * Không có cả hai thì thẻ im lặng. "Chỉnh sửa đánh giá" chỉ hiện khi server bật `review.canEdit`
 * (khách được sửa MỘT lần — `PATCH /reviews/:id`, lượt hai trả 409 `REVIEW_EDIT_LIMIT`).
 *
 * Gửi xong `useCreateReview` làm mới nhánh `trips` ⇒ chuyến về lại với `review`, thẻ tự đổi sang
 * bản chỉ-đọc.
 */
export function TripReviewCard({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.review');
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const review = trip.review;

  if (review) {
    if (editing && review.canEdit) {
      return (
        <ReviewForm
          titleId={titleId}
          edit={{ id: review.id, rating: review.rating, comment: review.comment ?? null }}
          onDone={() => setEditing(false)}
        />
      );
    }
    return (
      <section className={layout.card} aria-labelledby={titleId}>
        <h2 id={titleId} className={layout.cardTitle}>
          {t('title')}
        </h2>
        <div className={styles.readHead}>
          <Stars value={review.rating} size="xl" />
          {review.editedAt ? <span className={styles.edited}>{t('edited')}</span> : null}
        </div>
        {review.comment ? <p className={styles.comment}>{review.comment}</p> : null}
        {review.canEdit ? (
          <div className={styles.editRow}>
            <CtaButton className={styles.editButton} onClick={() => setEditing(true)}>
              {t('edit')}
            </CtaButton>
            <span className={styles.hint}>{t('editHint')}</span>
          </div>
        ) : null}
      </section>
    );
  }

  /* `bookingId` chắc chắn có khi `canReview` — chỉ chuyến hoàn thành (đã có đơn) mới được bật cờ. */
  if (!trip.canReview || !trip.bookingId) return null;

  return <ReviewForm bookingId={trip.bookingId} titleId={titleId} />;
}

interface ReviewFormProps {
  titleId: string;
  /** Tạo mới: đơn được đánh giá. */
  bookingId?: string;
  /** Sửa: bản đang có — điền sẵn form. */
  edit?: { id: string; rating: number; comment: string | null };
  onDone?: () => void;
}

function ReviewForm({ bookingId, titleId, edit, onDone }: ReviewFormProps) {
  const t = useTranslations('Trips.review');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const create = useCreateReview();
  const update = useUpdateReview();
  const pending = create.isPending || update.isPending;

  const schema = useMemo(
    () =>
      buildReviewSchema({
        ratingRequired: t('validation.ratingRequired'),
        ratingRange: t('validation.ratingRange', { min: RATING_MIN, max: RATING_MAX }),
        commentTooLong: t('validation.commentTooLong', { max: REVIEW_COMMENT_MAX }),
      }),
    [t],
  );
  const { control, handleSubmit } = useForm<ReviewFormValues>({
    resolver: yupResolver(schema),
    // Chưa chọn sao — đánh giá là lựa chọn của khách, không điền sẵn 5 sao thay họ.
    defaultValues: edit ? { rating: edit.rating, comment: edit.comment ?? '' } : { comment: '' },
  });

  const onSubmit = handleSubmit((values) => {
    // Enter gửi form cả khi nút đang quay — chặn lượt thứ hai ở đây.
    if (pending) return;
    if (edit) {
      update.mutate(
        { id: edit.id, rating: values.rating, comment: values.comment || undefined },
        {
          onSuccess: () => message.success(t('editSuccess')),
          onError: (err) => message.error(errorMessage(err)),
          // Lỗi hay thành công đều về bản chỉ-đọc — `canEdit` mới từ server quyết nút sửa.
          onSettled: () => onDone?.(),
        },
      );
      return;
    }
    if (!bookingId) return;
    create.mutate(
      { bookingId, rating: values.rating, comment: values.comment || undefined },
      {
        onSuccess: () => message.success(t('success')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <section className={layout.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={layout.cardTitle}>
        {t('title')}
      </h2>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Controller
          control={control}
          name="rating"
          render={({ field, fieldState }) => (
            <div className={styles.field}>
              <Rate
                value={field.value ?? 0}
                onChange={field.onChange}
                count={RATING_MAX}
                aria-label={t('ratingLabel')}
                className={styles.rate}
              />
              {fieldState.error ? (
                <span className={styles.error} role="alert">
                  {fieldState.error.message}
                </span>
              ) : null}
            </div>
          )}
        />
        <Controller
          control={control}
          name="comment"
          render={({ field, fieldState }) => (
            <div className={styles.field}>
              <Input.TextArea
                {...field}
                rows={3}
                maxLength={REVIEW_COMMENT_MAX}
                aria-label={t('commentLabel')}
                placeholder={t('commentPlaceholder')}
                status={fieldState.error ? 'error' : undefined}
              />
              {fieldState.error ? (
                <span className={styles.error} role="alert">
                  {fieldState.error.message}
                </span>
              ) : null}
            </div>
          )}
        />
        {edit ? <span className={styles.hint}>{t('editHint')}</span> : null}
        <div className={styles.actions}>
          <CtaButton type="submit" className={styles.submit} loading={pending}>
            {edit ? t('saveEdit') : t('submit')}
          </CtaButton>
          {edit ? (
            <Button type="text" onClick={onDone} disabled={pending}>
              {tCommon('actions.cancel')}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
