'use client';

import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Alert, Select, Skeleton } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CUSTOMER_CANCEL_PREVIEW_KIND,
  CUSTOMER_CANCELLATION_REASON_VALUES,
  type CustomerCancellationReason,
  CUSTOMER_TRIP_STAGE,
  type CustomerTripStage,
} from '@xeprime/types';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { cx } from '@/lib/cx';
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
  /** Nhóm lý do — bắt buộc chọn (Figma 21621:31264). Ai chịu trách nhiệm vẫn do server suy (ADR 0045). */
  const [reason, setReason] = useState<CustomerCancellationReason | undefined>(undefined);
  const [reasonTouched, setReasonTouched] = useState(false);
  /** Có tiền giữ chỗ qua XePrime ⇒ câu "đã thanh toán" + "Dự kiến hoàn lại" (số do server tính). */
  const refundable =
    preview.data &&
    (preview.data.kind === CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND ||
      preview.data.kind === CUSTOMER_CANCEL_PREVIEW_KIND.LATE_CANCEL)
      ? preview.data
      : null;
  const close = () => {
    setReason(undefined);
    setReasonTouched(false);
    onClose();
  };

  return (
    <ResponsiveDialog
      title={t('title')}
      hideHeaderTitle
      ariaLabel={t('title')}
      open={open}
      onClose={close}
      size="sm"
      okText={t('confirm')}
      okDisabled={notAllowed}
      destructive
      cancelText={t('keep')}
      onOk={() => {
        // Enter gửi form cả khi nút OK đang quay — không bắn lượt huỷ thứ hai.
        if (cancel.isPending || notAllowed) return;
        if (!reason) {
          setReasonTouched(true);
          return;
        }
        cancel.mutate(reason, { onSuccess: close });
      }}
      confirmLoading={cancel.isPending}
    >
      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.featuredIcon} aria-hidden>
            <ExclamationCircleOutlined />
          </span>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.lead}>
            {refundable
              ? t.rich('leadPaid', {
                  policy: (chunks) => (
                    <Link
                      href={legalPath.doc(LEGAL_DOC.CANCELLATION)}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.policyLink}
                    >
                      {chunks}
                    </Link>
                  ),
                })
              : pending
                ? t('leadPending')
                : awaitingHold
                  ? t('leadAwaitingHold')
                  : t('leadReady')}
          </p>
          {refundable ? (
            <p className={styles.lead}>
              {t.rich('expectedRefund', {
                amount: fmt.money(refundable.refundAmount),
                gold: (chunks) => <strong className={styles.refundAmount}>{chunks}</strong>,
              })}
            </p>
          ) : null}
        </div>

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

        {notAllowed ? null : (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cancel-trip-reason">
              {t('reasonLabel')}
              <span className={styles.required} aria-hidden>
                *
              </span>
            </label>
            <Select<CustomerCancellationReason>
              id="cancel-trip-reason"
              size="large"
              value={reason}
              placeholder={t('reasonPlaceholder')}
              onChange={(value) => setReason(value)}
              status={reasonTouched && !reason ? 'error' : undefined}
              options={CUSTOMER_CANCELLATION_REASON_VALUES.map((value) => ({
                value,
                label: t(`reasons.${value}`),
              }))}
            />
            {reasonTouched && !reason ? (
              <span className={styles.error} role="alert">
                {t('reasonRequired')}
              </span>
            ) : null}
          </div>
        )}

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

  /*
   * Hoàn đủ: đầu hộp đã nói "đã thanh toán" + "Dự kiến hoàn lại" — không lặp lại bằng một khung
   * nữa. Chỉ còn lời nhắc hoàn CHẬM khi server báo có, vì đầu hộp không nói điều đó.
   */
  if (preview.kind === CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND) return deferred;

  if (preview.kind === CUSTOMER_CANCEL_PREVIEW_KIND.LATE_CANCEL) {
    const title = preview.freeCancelAvailable ? t('lateTitle') : t('noFreeCancelTitle');
    /*
     * Quá mốc huỷ miễn phí — khung phiếu sạch theo hộp thoại Figma `21621:31264` (nền xám nhạt, bo 12,
     * hàng nhãn/số), không dùng khung cảnh báo cam đặc. Lời nhắc hệ quả nằm ở dải vàng nhạt bên dưới.
     */
    return (
      <section className={styles.refundBox} aria-label={title}>
        <p className={styles.refundTitle}>{title}</p>
        <dl className={styles.facts}>
          <div className={styles.factRow}>
            <dt>{t('paid')}</dt>
            <dd>{fmt.money(preview.paidAmount)}</dd>
          </div>
          <div className={styles.factRow}>
            <dt>{t('forfeit')}</dt>
            <dd className={styles.factForfeit}>{fmt.money(preview.forfeitAmount)}</dd>
          </div>
          <div className={styles.factDivider} role="presentation" />
          <div className={cx(styles.factRow, styles.factTotal)}>
            <dt>{t('refund')}</dt>
            <dd>{fmt.money(preview.refundAmount)}</dd>
          </div>
        </dl>
        <p className={styles.refundHint}>
          {isZeroMoney(preview.insuranceRefundAmount)
            ? t('lateBodyNoInsurance')
            : t('lateBody', { insurance: fmt.money(preview.insuranceRefundAmount) })}
        </p>
        {deferred}
      </section>
    );
  }

  return null;
}
