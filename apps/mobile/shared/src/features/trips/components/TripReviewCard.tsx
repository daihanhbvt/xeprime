import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RATING_MAX, RATING_MIN, RATING_SCALE, REVIEW_COMMENT_MAX } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Stars } from '@/components/ui/Stars';
import { TextField } from '@/components/ui/TextField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, radius, sizing, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { useCreateReview, useUpdateReview } from '../hooks/use-trips';
import { buildReviewSchema, type ReviewFormValues } from '../review-schema';
import { CardTitle } from './TripRequestCards';

/** `.rate` web (Figma `21621:68524`): năm sao 28px, cách nhau 8px. */
const STAR_SIZE = 28;
/** Sao chỉ đo 28 nhưng vùng chạm phải đủ `touchTarget` — chìa đều hai bên. */
const STAR_HIT_SLOP = (sizing.touchTarget - STAR_SIZE) / 2;
/** `Stars size="xl"` của bản chỉ-đọc. */
const READ_STAR_SIZE = 20;
/** `<TextArea rows={3}>` web. */
const COMMENT_ROWS = 3;

/**
 * "Đánh giá chuyến đi" — bản native của `TripReviewCard` web (Figma `21621:68041` chưa đánh giá ·
 * `21621:68560` đã đánh giá). FORM NẰM NGAY TRONG THẺ như web, không mở tấm trượt.
 *
 * Server quyết: `canReview` mở form (chuyến hoàn thành, chưa đánh giá), `review` là bản đã gửi.
 * Không có cả hai thì thẻ im lặng. "Chỉnh sửa đánh giá" chỉ hiện khi server bật `review.canEdit`
 * (sửa MỘT lần). Gửi/sửa xong hook làm mới nhánh chuyến ⇒ thẻ tự đổi sang bản chỉ-đọc.
 *
 * Vùng thẻ (`layout.card` ≤640px): viền `color-border` 1px, bo `radius-card` (16), đệm `space-md`,
 * khe `space-md`; tiêu đề `.cardTitle` body-lg semibold.
 *
 * Bàn phím: thẻ nằm trong `Screen` của chi tiết chuyến, và `Screen` tự đo ô đang focus rồi cuộn nó
 * khỏi bàn phím (`references/ui-kit.md` — "The keyboard covers the last input"); không cần nối gì.
 */
export function TripReviewCard({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const t = useTranslations('Trips.review');
  const [editing, setEditing] = useState(false);
  const review = trip.review;

  if (review) {
    if (editing && review.canEdit) {
      return (
        <ReviewForm
          trip={trip}
          edit={{ id: review.id, rating: review.rating, comment: review.comment ?? null }}
          onDone={() => setEditing(false)}
        />
      );
    }
    return (
      <Card radius={radius.card}>
        <YStack gap={space.md}>
          <CardTitle icon="star-outline">{t('title')}</CardTitle>
          {/* `.readHead`: sao xl + "đã chỉnh sửa" body-sm `text-tertiary`, khe `space-sm`. */}
          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            <Stars value={review.rating} size={READ_STAR_SIZE} />
            {review.editedAt ? (
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {t('edited')}
              </Text>
            ) : null}
          </XStack>
          {/* `.comment`: body-lg `text-secondary`, giữ xuống dòng của khách. */}
          {review.comment ? (
            <Text col={colors.textMuted} fos={fontSize.bodyLg}>
              {review.comment}
            </Text>
          ) : null}
          {review.canEdit ? (
            /* `.editRow`: nút gradient (CtaButton) căn trái + gợi ý body-sm `text-tertiary`, khe `space-sm`. */
            <YStack ai="flex-start" gap={space.sm}>
              <Button
                variant="gradient"
                align="start"
                label={t('edit')}
                onPress={() => setEditing(true)}
              />
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {t('editHint')}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </Card>
    );
  }

  // `bookingId` chắc chắn có khi `canReview` — chỉ chuyến hoàn thành (đã có đơn) mới được bật cờ.
  if (!trip.canReview || !trip.bookingId) return null;
  return <ReviewForm trip={trip} />;
}

function ReviewForm({
  trip,
  edit,
  onDone,
}: {
  trip: CustomerTripDetail;
  /** Sửa: bản đang có — điền sẵn form. */
  edit?: { id: string; rating: number; comment: string | null };
  onDone?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.review');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  // Lỗi ánh xạ từ MÃ (ADR 0012) — vd `REVIEW_EDIT_LIMIT` — không hiện câu tiếng Việt của server.
  const errorMessage = useErrorMessage();
  const create = useCreateReview(trip.id);
  const update = useUpdateReview(trip.id);
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

  const submit = handleSubmit((values) => {
    // Bấm lần hai khi nút đang quay — chặn lượt thứ hai ở đây.
    if (pending) return;
    const comment = values.comment ? { comment: values.comment } : {};
    if (edit) {
      update.mutate(
        { id: edit.id, rating: values.rating, ...comment },
        {
          onSuccess: () => toast.showSuccess(t('editSuccess')),
          onError: (err) => toast.showError(errorMessage(err)),
          // Lỗi hay thành công đều về bản chỉ-đọc — `canEdit` mới từ server quyết nút sửa.
          onSettled: () => onDone?.(),
        },
      );
      return;
    }
    if (!trip.bookingId) return;
    create.mutate(
      { bookingId: trip.bookingId, rating: values.rating, ...comment },
      {
        onSuccess: () => toast.showSuccess(t('success')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <Card radius={radius.card}>
      <YStack gap={space.md}>
        <CardTitle icon="star-outline">{t('title')}</CardTitle>
        {/* `.form`: khe `space-md` giữa các trường; `.field`: khe `space-xs` giữa ô và lỗi. */}
        <Controller
          control={control}
          name="rating"
          render={({ field, fieldState }) => (
            <YStack gap={space.xs}>
              <StarPicker value={field.value ?? 0} onChange={field.onChange} />
              {/* `.error`: body-sm `color-error`. */}
              {fieldState.error?.message ? (
                <Text col={colors.danger} fos={fontSize.bodySm} accessibilityRole="alert">
                  {fieldState.error.message}
                </Text>
              ) : null}
            </YStack>
          )}
        />
        {/*
          Ô nhận xét — `<Input.TextArea rows={3}>` web: không nhãn nhìn thấy (chỉ `aria-label`),
          khung chuẩn của ô nhập (`FieldShell`: viền `border-input` 1px, bo theo bộ ô của app),
          đếm trần `REVIEW_COMMENT_MAX`.
        */}
        <TextField
          control={control}
          name="comment"
          label={t('commentLabel')}
          hideLabel
          placeholder={t('commentPlaceholder')}
          multiline
          rows={COMMENT_ROWS}
          maxLength={REVIEW_COMMENT_MAX}
        />
        {/* `.hint`: body-sm `text-tertiary` — chỉ khi đang SỬA. */}
        {edit ? (
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            {t('editHint')}
          </Text>
        ) : null}
        {/* `.actions`: nút gửi gradient căn trái (`.submit`) + "Huỷ" dạng chữ khi sửa, khe `space-sm`. */}
        <XStack ai="center" gap={space.sm} flexWrap="wrap">
          <Button
            variant="gradient"
            align="start"
            label={edit ? t('saveEdit') : t('submit')}
            loading={pending}
            onPress={() => void submit()}
          />
          {edit ? (
            <Button
              variant="ghost"
              align="start"
              label={tCommon('cancel')}
              disabled={pending}
              onPress={() => onDone?.()}
            />
          ) : null}
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * Chọn sao — `<Rate>` web: năm sao 28px cách nhau 8px, màu sao `color-primary` (chưa chọn: viền
 * `color-border`). Vùng chạm mỗi sao chìa tới `touchTarget` bằng `hitSlop`, không thổi phồng hình.
 */
export function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.review');
  return (
    <XStack
      ai="center"
      gap={space.sm}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('ratingLabel')}
    >
      {RATING_SCALE.map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          hitSlop={{ top: STAR_HIT_SLOP, bottom: STAR_HIT_SLOP, left: 4, right: 4 }}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === star }}
          accessibilityLabel={t('starA11y', { count: star })}
        >
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={STAR_SIZE}
            color={star <= value ? colors.primary : colors.border}
          />
        </Pressable>
      ))}
    </XStack>
  );
}
