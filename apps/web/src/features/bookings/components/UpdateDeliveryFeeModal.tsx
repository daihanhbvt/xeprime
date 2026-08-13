'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useUpdateBookingDeliveryFee } from '../hooks/use-booking-mutations';
import styles from './UpdateDeliveryFeeModal.module.css';

const schema = yup.object({
  deliveryFee: yup
    .number()
    .typeError('Nhập số tiền hợp lệ')
    .min(0, 'Phí giao nhận không thể âm')
    .max(999_999_999_999, 'Số tiền quá lớn')
    .required('Nhập phí giao nhận'),
  note: yup.string().trim().max(500, 'Tối đa 500 ký tự').default(''),
});

type Values = yup.InferType<typeof schema>;

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
          message.success('Đã cập nhật phí giao nhận');
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog
      title="Cập nhật phí giao nhận"
      open={open}
      onClose={onClose}
      size="sm"
      okText="Lưu"
      onOk={() => void handleSubmit(submit)()}
      confirmLoading={update.isPending}
    >
      <div className={styles.body}>
        <div className={styles.currentRow}>
          <span>Phí đang áp dụng</span>
          <b>{Number(currentFee) > 0 ? formatMoneyVnd(currentFee) : 'Miễn phí'}</b>
        </div>

        <NumberField
          control={control}
          name="deliveryFee"
          label="Phí giao nhận"
          money
          min={0}
          required
          help="Nhập 0 để trả về Miễn phí."
        />

        <TextAreaField
          control={control}
          name="note"
          label="Ghi chú nội bộ"
          placeholder="Lý do, mã tham chiếu…"
          rows={2}
        />

        <Alert
          type="info"
          showIcon
          message="Khách không cần xác nhận lại. Tổng tiền của đơn được tính lại trên máy chủ, và khách sẽ nhận thông báo là số tiền đã thay đổi."
        />

        {Number(currentFee) !== nextFee ? (
          <p className={styles.diff}>
            {Number(currentFee) > 0 ? formatMoneyVnd(currentFee) : 'Miễn phí'} →{' '}
            <b>{nextFee > 0 ? formatMoneyVnd(String(nextFee)) : 'Miễn phí'}</b>
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
