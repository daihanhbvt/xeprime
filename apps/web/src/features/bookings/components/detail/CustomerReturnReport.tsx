'use client';

import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BOOKING_STATUS } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { rejectCustomerReturn } from '@/features/handovers/api';
import { useInvalidateHandovers } from '@/features/handovers/hooks';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { toAppTz } from '@/lib/datetime';
import type { BookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

/**
 * Lời báo "Đã trả xe" của khách đang chờ gian hàng (ADR 0081) — cột phải của trang chi tiết, ngay
 * trên nút "Xác nhận đã nhận xe". Hai lối ra: xác nhận biên bản nhận xe như thường (nút chính), hoặc
 * "Khách chưa trả xe" ⇒ huỷ lời báo + XePrime mở tranh chấp xác minh. Im lặng quá hạn ⇒ tự hoàn thành.
 *
 * `canDispute` đi cùng quyền xác nhận bàn giao (và không trong phiên hỗ trợ) — server kiểm lại.
 */
export function CustomerReturnReport({
  booking,
  canDispute,
}: {
  booking: BookingDetail;
  canDispute: boolean;
}) {
  // Hầu hết đơn không có lời báo nào — không dựng mutation/hook cho một khối không hiện.
  if (
    booking.status !== BOOKING_STATUS.ACTIVE ||
    !booking.customerReturnedAt ||
    !booking.returnAutoCompleteAt
  ) {
    return null;
  }
  return (
    <PendingReport
      booking={booking}
      reportedAt={booking.customerReturnedAt}
      deadline={booking.returnAutoCompleteAt}
      canDispute={canDispute}
    />
  );
}

function PendingReport({
  booking,
  reportedAt,
  deadline,
  canDispute,
}: {
  booking: BookingDetail;
  reportedAt: string;
  deadline: string;
  canDispute: boolean;
}) {
  const t = useTranslations('Bookings.detailPage.customerReturn');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const [confirming, setConfirming] = useState(false);
  const errorMessage = useErrorMessage();
  const invalidate = useInvalidateHandovers(booking.id, booking.vehicleId);
  const reject = useMutation({
    mutationFn: () => rejectCustomerReturn(booking.id),
    onSuccess: () => {
      setConfirming(false);
      invalidate();
      message.success(t('rejected'));
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <>
      <Alert
        type="warning"
        showIcon
        className={styles.customerReturn}
        title={t('title', { time: fmt.rentalPoint(toAppTz(reportedAt)) })}
        description={
          <>
            <p className={styles.customerReturnBody}>
              {t('body', { deadline: fmt.rentalPoint(toAppTz(deadline)) })}
            </p>
            {canDispute ? (
              <Button danger size="small" onClick={() => setConfirming(true)}>
                {t('reject')}
              </Button>
            ) : null}
          </>
        }
      />
      <ResponsiveDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title={t('confirmTitle')}
        okText={t('confirmOk')}
        destructive
        confirmLoading={reject.isPending}
        onOk={() => {
          // Enter vẫn gửi form khi nút OK đang quay — chặn lượt thứ hai ở đây.
          if (!reject.isPending) reject.mutate();
        }}
      >
        <p className={styles.customerReturnBody}>{t('confirmBody')}</p>
      </ResponsiveDialog>
    </>
  );
}
