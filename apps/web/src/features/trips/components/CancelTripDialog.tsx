'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { CUSTOMER_TRIP_STAGE, type CustomerTripStage } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCancelTrip } from '../hooks';
import type { CustomerTripDetail } from '../types';
import styles from './CancelTripDialog.module.css';

/**
 * Xác nhận huỷ chuyến — lối thoát của khách khi gian hàng im lặng hoặc kế hoạch thay đổi.
 *
 * Hộp này tồn tại vì huỷ là việc KHÔNG HOÀN TÁC: yêu cầu đã rút thì phải gửi lại từ đầu, đơn đã
 * huỷ thì xe mở ra cho người khác đặt ngay. Một nút bấm thẳng không có bước xác nhận là cách
 * chắc chắn để có những cú huỷ nhầm.
 *
 * Chữ đổi theo chặng vì hệ quả khác nhau thật: rút một yêu cầu chưa ai duyệt gần như không mất
 * gì, còn huỷ một đơn đã chốt là nhả mất chỗ đã giữ.
 */
export function CancelTripDialog({
  trip,
  open,
  onClose,
}: {
  trip: CustomerTripDetail;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Trips.cancel');
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();
  const cancel = useCancelTrip(trip.id);

  const pending = trip.stage === (CUSTOMER_TRIP_STAGE.PENDING_APPROVAL as CustomerTripStage);

  /*
   * Tiền khách đã đưa cho gian hàng — tiền thuê đã trả cộng cọc đã thu. XePrime KHÔNG có cổng
   * thanh toán (design 14 §5) nên huỷ không hoàn lại đồng nào một cách tự động; nói thẳng điều
   * đó TRƯỚC khi khách bấm, thay vì để họ phát hiện ra sau.
   */
  const paid = trip.finance
    ? [trip.finance.rentalPaid, trip.finance.depositReceived].filter((v) => !isZeroMoney(v))
    : [];
  const hasPaid = paid.length > 0;

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('confirm')}
      destructive
      cancelText={t('keep')}
      onOk={() =>
        cancel.mutate(undefined, {
          onSuccess: onClose,
        })
      }
      confirmLoading={cancel.isPending}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          {pending ? t('leadPending') : t('leadReady')}
        </p>

        {hasPaid ? (
          <Alert
            type="warning"
            showIcon
            message={t('paidTitle')}
            description={
              <>
                {trip.finance && !isZeroMoney(trip.finance.rentalPaid) ? (
                  <div>{t('rentalPaid', { amount: fmt.money(trip.finance.rentalPaid) })}</div>
                ) : null}
                {trip.finance && !isZeroMoney(trip.finance.depositReceived) ? (
                  <div>
                    {t('depositPaid', { amount: fmt.money(trip.finance.depositReceived) })}
                  </div>
                ) : null}
                {/* Nói đúng năng lực của hệ thống: XePrime ghi nhận, chủ xe mới là người chuyển tiền. */}
                <div className={styles.refundNote}>{t('refundNote')}</div>
              </>
            }
          />
        ) : null}

        {cancel.isError ? (
          <Alert type="error" showIcon role="alert" message={errorMessage(cancel.error)} />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
