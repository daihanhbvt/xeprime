'use client';

import { Alert, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_CANCEL_PREVIEW_KIND,
  CUSTOMER_TRIP_STAGE,
  type CustomerTripStage,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCancelTrip, useTripCancelPreview } from '../hooks';
import type { CustomerTripCancelPreview, CustomerTripDetail } from '../types';
import styles from './CancelTripDialog.module.css';

/**
 * Xác nhận huỷ chuyến — lối thoát của khách khi gian hàng im lặng hoặc kế hoạch thay đổi.
 *
 * Hộp này tồn tại vì huỷ là việc KHÔNG HOÀN TÁC: yêu cầu đã rút thì phải gửi lại từ đầu, đơn đã
 * huỷ thì xe mở ra cho người khác đặt ngay. Một nút bấm thẳng không có bước xác nhận là cách
 * chắc chắn để có những cú huỷ nhầm.
 *
 * Chữ đổi theo chặng vì hệ quả khác nhau thật: rút một yêu cầu chưa ai duyệt gần như không mất
 * gì, huỷ lúc chủ xe đã nhận và đang giữ xe là nhả chỗ đó (chưa có đơn nào để "huỷ đơn"), còn huỷ
 * một đơn đã chốt là nhả mất chỗ đã giữ.
 *
 * TIỀN QUA XEPRIME (khoản giữ chỗ) đọc từ `GET /trips/:id/cancel-preview` — server tính bằng đúng
 * luật mà lượt bấm sẽ áp (ADR 0064): trong cửa sổ miễn phí hoàn đủ vào Ví điểm; sau mốc, bảo hiểm
 * hoàn đủ còn phần còn lại không hoàn. Khách thấy số được hoàn và số mất TRƯỚC khi bấm, không có
 * phép tính nào ở client.
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
  const preview = useTripCancelPreview(trip.id, open);

  const pending = trip.stage === (CUSTOMER_TRIP_STAGE.PENDING_APPROVAL as CustomerTripStage);
  /** Đã được nhận, chờ giữ chỗ — chưa có ĐƠN nào để "huỷ đơn", nhưng xe đang được giữ. */
  const awaitingHold = trip.stage === (CUSTOMER_TRIP_STAGE.AWAITING_HOLD as CustomerTripStage);

  /*
   * Tiền khách đã đưa cho gian hàng — tiền thuê đã trả cộng cọc đã thu. Khoản này KHÔNG đi qua
   * XePrime nên huỷ không hoàn lại đồng nào một cách tự động; nói thẳng điều đó TRƯỚC khi khách
   * bấm, thay vì để họ phát hiện ra sau.
   */
  const paid = trip.finance
    ? [trip.finance.rentalPaid, trip.finance.depositReceived].filter((v) => !isZeroMoney(v))
    : [];
  const hasPaid = paid.length > 0;
  /**
   * Server nói chặng này KHÔNG huỷ được nữa (đơn đang chạy — ADR 0045 điều 1: kết thúc sớm đi qua
   * bàn giao trả xe). Chặn nút ngay ở đây thay vì để khách bấm rồi nhận một lỗi.
   */
  const notAllowed = preview.data?.allowed === false;

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('confirm')}
      okDisabled={notAllowed}
      destructive
      cancelText={t('keep')}
      onOk={() => {
        // Enter gửi form cả khi nút OK đang quay — không bắn lượt huỷ thứ hai.
        if (cancel.isPending || notAllowed) return;
        cancel.mutate(undefined, { onSuccess: onClose });
      }}
      confirmLoading={cancel.isPending}
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          {pending ? t('leadPending') : awaitingHold ? t('leadAwaitingHold') : t('leadReady')}
        </p>

        {preview.isLoading ? (
          <Skeleton active title={false} paragraph={{ rows: 2 }} />
        ) : preview.isError ? (
          <Alert type="warning" showIcon title={t('preview.error')} />
        ) : notAllowed ? (
          <Alert
            type="warning"
            showIcon
            title={t('preview.notAllowedTitle')}
            description={t('preview.notAllowedBody')}
          />
        ) : preview.data ? (
          <CancelMoneyPreview preview={preview.data} />
        ) : null}

        {hasPaid ? (
          <Alert
            type="warning"
            showIcon
            title={t('paidTitle')}
            description={
              <>
                {trip.finance && !isZeroMoney(trip.finance.rentalPaid) ? (
                  <div>{t('rentalPaid', { amount: fmt.money(trip.finance.rentalPaid) })}</div>
                ) : null}
                {trip.finance && !isZeroMoney(trip.finance.depositReceived) ? (
                  <div>{t('depositPaid', { amount: fmt.money(trip.finance.depositReceived) })}</div>
                ) : null}
                {/* Nói đúng năng lực của hệ thống: XePrime ghi nhận, chủ xe mới là người chuyển tiền. */}
                <div className={styles.refundNote}>{t('refundNote')}</div>
              </>
            }
          />
        ) : null}

        {cancel.isError ? (
          <Alert type="error" showIcon role="alert" title={errorMessage(cancel.error)} />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * Khoản giữ chỗ đi đâu nếu huỷ ngay — ba câu theo `kind` của server, không câu nào tự tính.
 * `no_charge` / `not_allowed` không vẽ gì: không có đồng nào qua XePrime để nói.
 */
function CancelMoneyPreview({ preview }: { preview: CustomerTripCancelPreview }) {
  const t = useTranslations('Trips.cancel.preview');
  const fmt = useAppFormat();

  const deferred = preview.deferred ? <p className={styles.note}>{t('deferred')}</p> : null;

  if (preview.kind === CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND) {
    return (
      <Alert
        type="info"
        showIcon
        title={t('fullRefundTitle', { amount: fmt.money(preview.refundAmount) })}
        description={
          <>
            <p className={styles.note}>
              {preview.freeCancelUntil && preview.freeCancelAvailable
                ? t('fullRefundBefore', {
                    paid: fmt.money(preview.paidAmount),
                    time: fmt.dateTime(preview.freeCancelUntil),
                  })
                : t('fullRefundBody', { paid: fmt.money(preview.paidAmount) })}
            </p>
            {deferred}
          </>
        }
      />
    );
  }

  if (preview.kind === CUSTOMER_CANCEL_PREVIEW_KIND.LATE_CANCEL) {
    return (
      <Alert
        type="warning"
        showIcon
        title={preview.freeCancelAvailable ? t('lateTitle') : t('noFreeCancelTitle')}
        description={
          <>
            <dl className={styles.facts}>
              <div className={styles.factRow}>
                <dt>{t('paid')}</dt>
                <dd>{fmt.money(preview.paidAmount)}</dd>
              </div>
              <div className={styles.factRow}>
                <dt>{t('refund')}</dt>
                <dd>
                  <strong>{fmt.money(preview.refundAmount)}</strong>
                </dd>
              </div>
              <div className={styles.factRow}>
                <dt>{t('forfeit')}</dt>
                <dd>{fmt.money(preview.forfeitAmount)}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              {isZeroMoney(preview.insuranceRefundAmount)
                ? t('lateBodyNoInsurance')
                : t('lateBody', { insurance: fmt.money(preview.insuranceRefundAmount) })}
            </p>
            {deferred}
          </>
        }
      />
    );
  }

  return null;
}
