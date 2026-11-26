'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { BOOKING_SOURCE_LABEL_MAX } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUpdateBookingSource } from '../hooks/use-booking-mutations';
import { bookingSourcePayload, bookingSourceShape } from '../source-schema';
import { BookingSourceFields } from './BookingSourceFields';

interface BookingSourceDialogProps {
  bookingId: string;
  bookingCode: string;
  /** Nguồn đang lưu - luôn là nguồn ngoài sàn (đơn qua sàn không mở hộp này). */
  source: string;
  sourceLabel: string | null;
  open: boolean;
  onClose: () => void;
}

interface Values {
  source: string;
  sourceLabel: string;
}

/**
 * Đổi NGUỒN của một đơn tự lập (ADR 0110) - gắn nhầm kênh lúc lập đơn là chuyện thường, và nguồn chỉ
 * là nhãn thống kê: không chạm tiền, lịch hay trạng thái. Server ghi audit; đơn qua sàn bị từ chối
 * (`BOOKING_SOURCE_LOCKED`) nên nơi gọi chỉ mở hộp này cho đơn ngoài sàn.
 */
export function BookingSourceDialog({
  bookingId,
  bookingCode,
  source,
  sourceLabel,
  open,
  onClose,
}: BookingSourceDialogProps) {
  const t = useTranslations('Bookings.source');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateBookingSource(bookingId);

  const schema = useMemo(
    () =>
      yup.object(
        bookingSourceShape({
          required: t('validation.required'),
          nameRequired: t('validation.nameRequired'),
          nameMax: t('validation.nameMax', { max: BOOKING_SOURCE_LABEL_MAX }),
        }),
      ),
    [t],
  );

  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { source, sourceLabel: sourceLabel ?? '' },
  });

  // Mở lại với đơn khác / nguồn vừa đổi → nạp lại giá trị đang lưu, không giữ lựa chọn của lần trước.
  useEffect(() => {
    if (open) reset({ source, sourceLabel: sourceLabel ?? '' });
  }, [open, source, sourceLabel, reset]);

  function submit(values: Values) {
    if (update.isPending) return;
    update.mutate(bookingSourcePayload(values), {
      onSuccess: () => {
        message.success(t('edit.success'));
        onClose();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <ResponsiveDialog
      title={t('edit.title', { code: bookingCode })}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('edit.save')}
      onOk={() => void handleSubmit(submit)()}
      confirmLoading={update.isPending}
    >
      <DialogForm labelPosition="top" onSubmit={(event) => void handleSubmit(submit)(event)}>
        <BookingSourceFields control={control} sourceName="source" labelName="sourceLabel" />
      </DialogForm>
    </ResponsiveDialog>
  );
}
