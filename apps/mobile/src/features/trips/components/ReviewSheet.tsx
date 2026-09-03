import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  RATING_MAX,
  RATING_MIN,
  RATING_SCALE,
  REVIEW_COMMENT_MAX,
} from '@xeprime/types';
import { buildReviewSchema, type ReviewFormValues } from '../review-schema';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';
import { useCreateReview } from '../hooks/use-trips';
import type { CustomerTripDetail } from '../api';

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
}: {
  open: boolean;
  onClose: () => void;
  trip: CustomerTripDetail;
}) {
  const t = useTranslations('Trips.review');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const createReview = useCreateReview(trip.id);

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
    defaultValues: { rating: RATING_MAX, comment: '' },
  });

  const submit = handleSubmit((values) => {
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
          label={t('submit')}
          loading={createReview.isPending}
          onPress={() => void submit()}
        />
      }
    >
      <Controller
        control={control}
        name="rating"
        render={({ field }) => (
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('ratingLabel')}
            </Text>
            <StarPicker value={field.value} onChange={field.onChange} />
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
    </BottomSheet>
  );
}

/** Chọn sao. Vùng chạm là cả ô 48dp dù ngôi sao vẽ nhỏ hơn — năm mục một hàng rất dễ trượt. */
function StarPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const t = useTranslations('Trips.review');

  return (
    <XStack ai="center">
      {RATING_SCALE.map((star) => (
        <Pressable
          key={star}
          onPress={() => onChange(star)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === star }}
          accessibilityLabel={t('starA11y', { count: star })}
          style={{
            width: sizing.touchTarget,
            height: sizing.touchTarget,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={30}
            color={star <= value ? colors.primary : colors.border}
          />
        </Pressable>
      ))}
    </XStack>
  );
}
