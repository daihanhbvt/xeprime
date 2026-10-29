import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, RATING_MAX, RATING_MIN, REVIEW_COMMENT_MAX } from '@xeprime/types';
import { buildReviewSchema, type ReviewFormValues } from '../review-schema';
import { FieldLabel } from '@/components/ui/Field';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { useCreateReview, useUpdateReview } from '../hooks/use-trips';
import { StarPicker } from './TripReviewCard';
import type { CustomerTripDetail } from '../api';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * Đánh giá chuyến (BKG-16) — chỉ mở khi đơn đã `completed`, và SERVER là nơi chốt điều kiện đó.
 *
 * Đánh giá lần hai trả **409**: đó KHÔNG phải lỗi đỏ. Nó nghĩa là đánh giá đã tồn tại, nên tấm
 * này đóng lại và màn chi tiết hiện đánh giá cũ ở nhịp refetch — báo "có lỗi" cho một việc đã
 * thành công từ trước là bắt khách đi tìm một sự cố không có.
 */
export function ReviewSheet({
  open,
  onClose,
  trip,
  mode = 'create',
}: {
  open: boolean;
  onClose: () => void;
  trip: CustomerTripDetail;
  /** `edit` = sửa đánh giá đã gửi (MỘT lần, server bật `review.canEdit`), điền sẵn bản cũ. */
  mode?: 'create' | 'edit';
}) {
  const colors = useColors();
  const t = useTranslations('Trips.review');
  const toast = useAppToast();
  // Lỗi ánh xạ từ MÃ (ADR 0012) — vd `REVIEW_EDIT_LIMIT` — không hiện câu tiếng Việt của server.
  const errorMessage = useErrorMessage();
  const createReview = useCreateReview(trip.id);
  const updateReview = useUpdateReview(trip.id);
  const editing = mode === 'edit' && trip.review !== null;
  const pending = createReview.isPending || updateReview.isPending;

  /*
   * Dựng lại schema khi ngôn ngữ đổi — `t` đổi định danh theo locale, nên `useMemo` bám vào nó
   * là đủ. Dựng mỗi lần render thì `yupResolver` nhận một object mới mỗi nhịp và RHF phải xác
   * thực lại toàn form sau từng phím gõ.
   */
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
    defaultValues:
      editing && trip.review
        ? { rating: trip.review.rating, comment: trip.review.comment ?? '' }
        : // Chưa chọn sao — như web `TripReviewCard`: đánh giá là lựa chọn của khách, không điền sẵn 5 sao thay họ.
          { comment: '' },
  });

  const submit = handleSubmit((values) => {
    if (pending) return;
    if (editing && trip.review) {
      updateReview.mutate(
        {
          id: trip.review.id,
          rating: values.rating,
          ...(values.comment ? { comment: values.comment } : {}),
        },
        {
          onSuccess: () => {
            toast.showSuccess(t('editSuccess'));
            onClose();
          },
          onError: (error) => {
            toast.showError(errorMessage(error));
            onClose();
          },
        },
      );
      return;
    }
    if (!trip.bookingId) return;

    createReview.mutate(
      {
        bookingId: trip.bookingId,
        rating: values.rating,
        ...(values.comment ? { comment: values.comment } : {}),
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('success'));
          onClose();
        },
        onError: (error) => {
          if (getErrorCode(error) === API_ERROR_CODE.CONFLICT) {
            toast.showInfo(t('alreadyReviewed'));
            onClose();
            return;
          }
          toast.showError(errorMessage(error));
        },
      },
    );
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      subtitle={trip.vehicle.name}
      footer={
        <Button
          label={editing ? t('saveEdit') : t('submit')}
          icon="send-outline"
          loading={pending}
          onPress={() => void submit()}
        />
      }
    >
      <Controller
        control={control}
        name="rating"
        render={({ field, fieldState }) => (
          <YStack gap={space.xs}>
            <FieldLabel label={t('ratingLabel')} required />
            {/* Chưa chọn sao ⇒ giá trị rỗng, vẽ 0 sao; bấm Gửi khi chưa chọn thì hiện lỗi bắt buộc. */}
            <StarPicker value={field.value ?? 0} onChange={field.onChange} />
            {fieldState.error?.message ? (
              <Text col={colors.danger} fos={fontSize.label}>
                {fieldState.error.message}
              </Text>
            ) : null}
          </YStack>
        )}
      />

      <TextField
        control={control}
        name="comment"
        label={t('commentLabel')}
        placeholder={t('commentPlaceholder')}
        multiline
        maxLength={REVIEW_COMMENT_MAX}
      />

      {editing ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('editHint')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

/* `StarPicker` dùng chung với thẻ đánh giá trong chuyến (`TripReviewCard`) — một hình sao cho cả app. */
