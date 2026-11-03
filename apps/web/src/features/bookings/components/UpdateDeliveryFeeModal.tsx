'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { NumberField } from '@/components/form/NumberField';
import { DialogForm } from '@/components/form/DialogForm';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import { useUpdateBookingDeliveryFee } from '../hooks/use-booking-mutations';
import styles from './UpdateDeliveryFeeModal.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface SchemaMessages {
  invalid: string;
  negative: string;
  tooLarge: string;
  required: string;
  noteMax: string;
}

function buildSchema(m: SchemaMessages) {
  return yup.object({
    deliveryFee: yup
      .number()
      .typeError(m.invalid)
      .min(0, m.negative)
      .max(999_999_999_999, m.tooLarge)
      .required(m.required),
    note: yup.string().trim().max(500, m.noteMax).default(''),
  });
}

type Values = yup.InferType<ReturnType<typeof buildSchema>>;

interface UpdateDeliveryFeeModalProps {
  bookingId: string;
  /** Phí hiện tại dạng chuỗi tiền (ADR 0007). */
  currentFee: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Chốt phí giao nhận của một đơn — hành động PHỤ của chủ xe (Wave 9).
 *
 * Thay cho vòng "báo giá → khách xác nhận" đã bỏ. Hai bên thống nhất phí qua điện thoại/chat
 * NGOÀI ứng dụng; ở đây chỉ ghi lại con số đã thoả thuận. Vì thế:
 *
 *  - không hỏi khoảng cách, không tính theo bậc;
 *  - không có bước chờ khách đồng ý — lưu là xong;
 *  - **tổng tiền do server tính lại**, client không tự cộng (ADR 0007);
 *  - `0` là giá trị hợp lệ và có nghĩa: trả đơn về `Miễn phí`.
 *
 * Ghi chú là NỘI BỘ: vào audit, không hiển thị cho khách.
 */
export function UpdateDeliveryFeeModal({
  bookingId,
  currentFee,
  open,
  onClose,
}: UpdateDeliveryFeeModalProps) {
  const fmt = useAppFormat();
  const t = useTranslations('Bookings.deliveryFeeModal');
  const tFee = useTranslations('Bookings.deliveryFee');
  const tCommon = useTranslations('Common');
  const schema = useMemo(
    () =>
      buildSchema({
        invalid: t('invalid'),
        negative: t('negative'),
        tooLarge: t('tooLarge'),
        required: t('required'),
        noteMax: t('noteMax'),
      }),
    [t],
  );

  const { message } = App.useApp();
  const update = useUpdateBookingDeliveryFee(bookingId);

  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { deliveryFee: Number(currentFee) || 0, note: '' },
  });

  // Mở lại với đơn khác / phí vừa đổi → nạp lại giá trị đang lưu, không giữ số của lần trước.
  useEffect(() => {
    if (open) reset({ deliveryFee: Number(currentFee) || 0, note: '' });
  }, [open, currentFee, reset]);

  // `useWatch` chứ không phải `watch()`: hàm `watch` không memo hoá an toàn (cảnh báo compiler).
  const nextFee = useWatch({ control, name: 'deliveryFee' });

  function submit(values: Values) {
    update.mutate(
      {
        // Tiền qua JSON là CHUỖI (ADR 0007) — form giữ number cho ô nhập, hoá chuỗi ở đây.
        deliveryFee: String(values.deliveryFee),
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      },
      {
        onSuccess: () => {
          message.success(tFee('success'));
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog
      title={tFee('title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={tCommon('actions.save')}
      onOk={() => void handleSubmit(submit)()}
      confirmLoading={update.isPending}
    >
      <DialogForm
        className={styles.body}
        labelWidth="md"
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <div className={styles.currentRow}>
          <span>{t('current')}</span>
          <b>{Number(currentFee) > 0 ? fmt.money(currentFee) : t('free')}</b>
        </div>

        <NumberField
          control={control}
          name="deliveryFee"
          label={tFee('title')}
          money
          min={0}
          required
          help={t('zeroHint')}
        />

        <TextAreaField
          control={control}
          name="note"
          label={tFee('noteLabel')}
          placeholder={t('notePlaceholder')}
          rows={2}
        />

        <Alert
          type="info"
          showIcon
          title={t('info')}
        />

        {Number(currentFee) !== nextFee ? (
          <p className={styles.diff}>
            {Number(currentFee) > 0 ? fmt.money(currentFee) : t('free')} →{' '}
            <b>{nextFee > 0 ? fmt.money(String(nextFee)) : t('free')}</b>
          </p>
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
