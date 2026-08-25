'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { BOOKING_STATUS } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isZeroMoney } from '@/lib/money';
import { useTransitionBooking } from '../hooks/use-booking-mutations';
import type { BookingDetail } from '../types';
import styles from './BookingStatusTransitionDialog.module.css';

/** Trần lý do — cùng con số với `TransitionBookingDto.reason` ở backend. */
const REASON_MAX = 500;

/**
 * Hai kết thúc tiêu cực mà hộp này phục vụ. Kiểu hẹp có chủ đích: `active → completed` đi qua
 * biên bản nhận xe (design 14 §3), và `reserved → confirmed` không phá huỷ gì nên không cần
 * hộp xác nhận — mở hộp này cho chúng là mở một đường vòng qua luồng bàn giao.
 */
export type BookingClosingTarget = typeof BOOKING_STATUS.CANCELLED | typeof BOOKING_STATUS.NO_SHOW;

interface BookingStatusTransitionDialogProps {
  booking: BookingDetail;
  target: BookingClosingTarget;
  open: boolean;
  onClose: () => void;
}

/**
 * Xác nhận HỦY ĐƠN / GHI NHẬN KHÁCH KHÔNG ĐẾN — hai hành động phá huỷ của gian hàng.
 *
 * Vì sao là một hộp có form chứ không phải một `Modal.confirm` hai nút: cả hai đích đều khép đơn
 * lại vĩnh viễn (`isBookingFinal`) và **nhả lịch xe ngay trong cùng transaction** (ADR 0006) —
 * khung giờ vừa mở ra có thể bị đơn khác chiếm trong vài giây, nên không có đường lùi. UX
 * guidelines §3 buộc hành động không hoàn tác phải nêu rõ hậu quả và phạm vi, và bắt chọn lý do
 * khi nó đụng tới tiền; ở đây lý do là BẮT BUỘC, backend cũng từ chối nếu thiếu.
 *
 * Lý do đi vào audit (`afterJson.reason`), KHÔNG vào `booking.note`: note là nội dung của đơn,
 * người sau sửa đè được; lời giải thích cho một quyết định thì không được phép mất.
 *
 * Tiền đã thu KHÔNG bị đụng tới. XePrime không có cổng thanh toán (ADR 0013) nên không có gì để
 * hoàn tự động — hộp này nói thẳng điều đó TRƯỚC khi bấm, thay vì để nhân viên phát hiện ra khi
 * khách gọi đòi tiền.
 */
export function BookingStatusTransitionDialog({
  booking,
  target,
  open,
  onClose,
}: BookingStatusTransitionDialogProps) {
  const t = useTranslations('Bookings.statusActions.dialog');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const transition = useTransitionBooking(booking.id);

  const isCancel = target === BOOKING_STATUS.CANCELLED;

  /*
   * Schema dựng TRONG component vì thông điệp lỗi phải theo ngôn ngữ đang dùng (ADR 0012), mà
   * `@xeprime/validators` là gói framework-free không đọc được bộ dịch của request. `useMemo`
   * theo `t` để mỗi lần gõ không dựng lại resolver.
   */
  const schema = useMemo(
    () =>
      yup.object({
        reason: yup
          .string()
          .trim()
          .required(t('reasonRequired'))
          .max(REASON_MAX, t('reasonTooLong'))
          .default(''),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<{ reason: string }>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });

  /*
   * "Đã thu" là tiền gian hàng ĐANG CẦM của khách — gồm cả phiếu thu tay ghi ở sổ Thu-Chi.
   * Đây là con số duy nhất có nghĩa ở đây; `depositAmount` là cọc theo cấu hình đơn, chưa chắc
   * đã thu được đồng nào.
   */
  const hasCollected = !isZeroMoney(booking.collectedAmount);

  function submit(values: { reason: string }) {
    transition.mutate(
      { status: target, reason: values.reason.trim() },
      {
        onSuccess: () => {
          message.success(
            isCancel
              ? t('cancelSuccess', { code: booking.code })
              : t('noShowSuccess', { code: booking.code }),
          );
          onClose();
        },
        // Lỗi ở lại TRONG hộp (UX guidelines §5): người dùng còn phải xử lý nó, và toast thì bay
        // đi mất. Form giữ nguyên chữ đã gõ.
      },
    );
  }

  return (
    <ResponsiveDialog
      title={
        isCancel
          ? t('cancelTitle', { code: booking.code })
          : t('noShowTitle', { code: booking.code })
      }
      open={open}
      onClose={onClose}
      size="sm"
      // Form ⇒ bàn phím ảo cần chỗ: quy tắc 5 của ResponsiveDialog (sheet 85dvh bị che mất ô nhập).
      mobileMode="fullscreen"
      destructive
      okText={isCancel ? t('cancelOk') : t('noShowOk')}
      cancelText={t('keep')}
      onOk={() => void handleSubmit(submit)()}
      // Chống bấm lặp: AntD khoá nút, ResponsiveDialog khoá luôn Esc và nền khi đang gửi.
      confirmLoading={transition.isPending}
    >
      <DialogForm
        className={styles.body}
        labelWidth="sm"
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <p className={styles.lead}>{isCancel ? t('cancelLead') : t('noShowLead')}</p>

        {/* Nói rõ đang đụng vào ĐƠN NÀO: mã đơn, khách, xe, khung giờ (UX guidelines §3). */}
        <dl className={styles.summary}>
          <div className={styles.row}>
            <dt>{t('customer')}</dt>
            <dd>{booking.customerName}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t('vehicle')}</dt>
            <dd>
              {booking.vehicleName}
              {booking.vehiclePlate ? ` · ${booking.vehiclePlate}` : ''}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('period')}</dt>
            <dd>{fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}</dd>
          </div>
        </dl>

        {hasCollected ? (
          <Alert
            type="warning"
            showIcon
            message={t('paidTitle', { amount: fmt.money(booking.collectedAmount) })}
            description={t('paidDescription')}
          />
        ) : null}

        <TextAreaField
          control={control}
          name="reason"
          label={t('reasonLabel')}
          placeholder={t('reasonPlaceholder')}
          help={t('reasonHelp')}
          maxLength={REASON_MAX}
          rows={3}
          required
        />

        {transition.isError ? (
          <Alert type="error" showIcon role="alert" message={errorMessage(transition.error)} />
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
