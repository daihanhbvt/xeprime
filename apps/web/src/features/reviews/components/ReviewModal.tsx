'use client';

import { App, Button, Rate } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { Controller, useForm } from 'react-hook-form';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { useCreateReview } from '../hooks/use-create-review';
import { reviewFormSchema, type ReviewFormValues } from '../schema';
import styles from './ReviewModal.module.css';

const DEFAULTS: ReviewFormValues = { rating: 5, comment: '' };

/**
 * Chuyến đang được đánh giá — chỉ khai đúng thứ hộp này cần.
 *
 * Cố ý KHÔNG buộc vào một DTO cụ thể: hộp đánh giá được mở từ danh sách chuyến lẫn trang chi
 * tiết, và trói nó vào shape của một trong hai là bắt bên kia phải nặn dữ liệu cho vừa.
 */
export interface ReviewTargetTrip {
  bookingId: string;
  vehicleName: string;
}

/** Khách đánh giá một chuyến đã hoàn thành. Số sao qua AntD Rate (RHF Controller), nhận xét tuỳ chọn. */
export function ReviewModal({
  trip,
  open,
  onClose,
}: {
  trip: ReviewTargetTrip | null;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ReviewFormValues>({
    resolver: yupResolver(reviewFormSchema),
    defaultValues: DEFAULTS,
  });
  const create = useCreateReview();

  const onSubmit = handleSubmit((values) => {
    if (!trip) return;
    create.mutate(
      { bookingId: trip.bookingId, rating: values.rating, comment: values.comment || undefined },
      {
        onSuccess: () => {
          message.success('Cảm ơn bạn đã đánh giá!');
          reset(DEFAULTS);
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={trip ? `Đánh giá · ${trip.vehicleName}` : 'Đánh giá'}
      open={open}
      onClose={onClose}
      footer={null}
    >
      <form onSubmit={onSubmit} noValidate>
        <div className={styles.field}>
          <span className={styles.label}>Số sao</span>
          <Controller
            control={control}
            name="rating"
            render={({ field, fieldState }) => (
              <div>
                <Rate value={field.value} onChange={field.onChange} />
                {fieldState.error ? (
                  <div className={styles.err}>{fieldState.error.message}</div>
                ) : null}
              </div>
            )}
          />
        </div>

        <TextAreaField
          control={control}
          name="comment"
          label="Nhận xét (tuỳ chọn)"
          rows={4}
          maxLength={2000}
        />

        <div className={styles.actions}>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            Gửi đánh giá
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
