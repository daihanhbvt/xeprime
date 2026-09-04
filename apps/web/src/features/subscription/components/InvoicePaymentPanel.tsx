'use client';

/* eslint-disable @next/next/no-img-element -- ảnh QR sinh động theo số tiền + mã, không phải
 * asset tĩnh để đi qua next/image; kích thước cố định nên không gây layout shift. */

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { subtractMoney } from '@xeprime/domain';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePaymentInfo } from '../hooks/use-subscription';
import type { PaymentInfo, SubscriptionInvoice } from '../types';
import styles from './InvoicePaymentPanel.module.css';

/**
 * Hướng dẫn chuyển khoản cho MỘT hoá đơn gói đang chờ tiền — dùng ở hai chỗ: màn "chuyển
 * khoản" của PurchaseModal ngay sau khi mua, và đầu trang "Gói của tôi" khi còn hoá đơn chờ
 * (người dùng đóng modal rồi vẫn phải tìm lại được QR — kích hoạt là việc của webhook, không
 * phải của tab trình duyệt còn mở).
 *
 * QR là VietQR quicklink CÓ SẴN số tiền + nội dung (ADR 0016 điều 5): nội dung chuyển khoản là
 * khoá đối soát, không bao giờ để người dùng tự gõ. Chưa cấu hình tài khoản nhận (nhóm SEPAY_*)
 * thì rơi về mã + số tiền như trước — có gì hiện nấy, không hiện QR trỏ vào hư không.
 *
 * Hoá đơn `partially_paid` hiện SỐ CÒN THIẾU và QR mang đúng số đó — bắt người chuyển thiếu tự
 * trừ nhẩm là cách nhận thêm một lần chuyển sai.
 */
export function InvoicePaymentPanel({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const paymentInfo = usePaymentInfo();

  const remaining =
    invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
      ? (subtractMoney(invoice.totalAmount, invoice.paidAmount) ?? invoice.totalAmount)
      : invoice.totalAmount;

  const info = paymentInfo.data;
  const qrUrl = info?.configured ? buildVietQrUrl(info, remaining, invoice.code) : null;

  return (
    <div className={styles.panel}>
      <Alert
        type="info"
        showIcon
        message={
          invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
            ? t('partialIntro', { paid: fmt.money(invoice.paidAmount) })
            : t('intro')
        }
      />

      <div className={styles.body}>
        {qrUrl ? (
          <img
            src={qrUrl}
            alt={t('qrAlt')}
            width={220}
            height={260}
            className={styles.qr}
            loading="lazy"
          />
        ) : null}

        <dl className={styles.fields}>
          {info?.configured ? (
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
              <b className={styles.amount}>{fmt.money(remaining)}</b>{' '}
              <CopyButton value={remaining} label={t('copyAmount')} />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('code')}</dt>
            <dd>
              <b className={styles.code}>{invoice.code}</b>{' '}
              <CopyButton value={invoice.code} label={t('copyCode')} />
            </dd>
          </div>
        </dl>
      </div>

      {invoice.expiresAt ? (
        <p className={styles.expires}>{t('expires', { date: fmt.dateTime(invoice.expiresAt) })}</p>
      ) : null}
      <p className={styles.note}>{t('autoActivateNote')}</p>
    </div>
  );
}

/**
 * Ảnh VietQR quicklink — dịch vụ công khai của VietQR, dựng từ thông tin tài khoản + số tiền +
 * nội dung. `compact2` = khung có logo ngân hàng + số tiền in sẵn, vừa khung 220px.
 */
function buildVietQrUrl(info: PaymentInfo, amount: string, code: string): string {
  const params = new URLSearchParams({
    amount,
    addInfo: code,
    ...(info.accountName ? { accountName: info.accountName } : {}),
  });
  return `https://img.vietqr.io/image/${info.bankCode}-${info.accountNumber}-compact2.png?${params.toString()}`;
}
