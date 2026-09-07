'use client';

/* eslint-disable @next/next/no-img-element -- ảnh QR sinh động theo số tiền + mã, không phải
 * asset tĩnh để đi qua next/image; kích thước cố định nên không gây layout shift. */

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { BOOKING_HOLD_STATUS, HOLD_REFUND_STATUS } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import type { CustomerTripDetail } from '../types';
import styles from './TripHoldPanel.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Khoản GIỮ CHỖ của một chuyến, nhìn từ phía KHÁCH — R3, ADR 0028 điều 6–7.
 *
 * Panel này trả lời đúng bốn câu, theo thứ tự khách cần:
 *   1. Phải chuyển bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Nội dung chuyển khoản là gì — MÃ, thứ quyết định tiền khớp vào chuyến nào;
 *   3. Trước khi nào, nếu không thì chỗ được nhả;
 *   4. Phần còn lại trả cho ai (chủ xe, lúc nhận xe — ADR 0028 điều 7A).
 *
 * VietQR mang SẴN số tiền và nội dung (ADR 0016 điều 5): không bao giờ để khách tự gõ mã, vì
 * một ký tự sai là một khoản tiền không khớp được và phải chờ admin xử lý tay.
 *
 * Mọi mốc đọc từ server (`expiresAt`, `freeCancelUntil`) — không tính lại ở client, vì lệch đồng
 * hồ máy khách sẽ rơi đúng vào lúc tiền phụ thuộc vào nó.
 */
export function TripHoldPanel({ hold }: { hold: Hold }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

  if (!awaiting) return <HoldOutcome hold={hold} />;

  const info = hold.paymentInfo;
  const qrUrl = info.configured ? buildVietQrUrl(info, hold.remainingAmount, hold.code) : null;

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <Alert
        type={hold.status === BOOKING_HOLD_STATUS.UNDERPAID ? 'warning' : 'info'}
        showIcon
        message={
          hold.status === BOOKING_HOLD_STATUS.UNDERPAID
            ? t('partialIntro', { paid: fmt.money(hold.paidAmount) })
            : t('intro')
        }
      />

      <div className={styles.body}>
        {qrUrl ? (
          <img src={qrUrl} alt={t('qrAlt')} width={220} height={260} className={styles.qr} loading="lazy" />
        ) : null}

        <dl className={styles.fields}>
          {info.configured ? (
            <>
              <div className={styles.row}>
                <dt>{t('bank')}</dt>
                <dd>{info.bankCode}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('accountNumber')}</dt>
                <dd>
                  <b>{info.accountNumber}</b>{' '}
                  {info.accountNumber ? (
                    <CopyButton value={info.accountNumber} label={t('copyAccount')} />
                  ) : null}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('accountName')}</dt>
                <dd>{info.accountName}</dd>
              </div>
            </>
          ) : null}
          <div className={styles.row}>
            <dt>{t('amount')}</dt>
            <dd>
              <b className={styles.amount}>{fmt.money(hold.remainingAmount)}</b>{' '}
              <CopyButton value={hold.remainingAmount} label={t('copyAmount')} />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('code')}</dt>
            <dd>
              <b className={styles.code}>{hold.code}</b>{' '}
              <CopyButton value={hold.code} label={t('copyCode')} />
            </dd>
          </div>
        </dl>
      </div>

      <p className={styles.expires}>{t('expires', { time: fmt.dateTime(hold.expiresAt) })}</p>
      <p className={styles.note}>{t('freeCancel', { time: fmt.dateTime(hold.freeCancelUntil) })}</p>
      <p className={styles.note}>{t('restAtHandover')}</p>
    </section>
  );
}

/**
 * Hold đã chốt hoặc đã chết — nói kết cục bằng tiếng người, kèm tình trạng hoàn nếu có.
 *
 * Không im lặng ở bất kỳ trạng thái nào: một khoản tiền đã chuyển mà màn hình không nhắc tới là
 * lý do đầu tiên khách gọi hỗ trợ.
 */
function HoldOutcome({ hold }: { hold: Hold }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const refund = hold.refund;

  if (refund) {
    const paid = refund.status === HOLD_REFUND_STATUS.PAID;
    return (
      <Alert
        type={paid ? 'success' : 'info'}
        showIcon
        message={
          paid
            ? t('refundPaid', { amount: fmt.money(refund.amount) })
            : refund.hasAccount
              ? t('refundPending', { amount: fmt.money(refund.amount) })
              : t('refundNeedsAccount', { amount: fmt.money(refund.amount) })
        }
      />
    );
  }

  if (hold.status === BOOKING_HOLD_STATUS.EXPIRED) {
    return <Alert type="warning" showIcon message={t('expired')} />;
  }
  if (hold.status === BOOKING_HOLD_STATUS.CANCELLED) return null;

  // `paid` / `released`: tiền đã về và chuyến đã có đơn — nói ngắn, chi tiết nằm ở khối tiền.
  return (
    <Alert type="success" showIcon message={t('paid', { amount: fmt.money(hold.paidAmount) })} />
  );
}

/**
 * Ảnh VietQR quicklink — dịch vụ công khai của VietQR, dựng từ tài khoản + số tiền + nội dung.
 * Cùng cách dựng với màn mua gói (`InvoicePaymentPanel`); giữ một công thức để hai màn không
 * sinh ra hai kiểu QR khác nhau.
 */
function buildVietQrUrl(
  info: Hold['paymentInfo'],
  amount: string,
  code: string,
): string {
  const params = new URLSearchParams({
    amount,
    addInfo: code,
    ...(info.accountName ? { accountName: info.accountName } : {}),
  });
  return `https://img.vietqr.io/image/${info.bankCode}-${info.accountNumber}-compact2.png?${params.toString()}`;
}
