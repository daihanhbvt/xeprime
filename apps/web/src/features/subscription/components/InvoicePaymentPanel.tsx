'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { subtractMoney } from '@xeprime/domain';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { paymentPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import type { SubscriptionInvoice } from '../types';
import { InvoicePlanSummary } from './InvoicePlanSummary';
import styles from './InvoicePaymentPanel.module.css';

/** Số còn phải chuyển — hoá đơn đã nhận một phần thì là phần CÒN THIẾU, không phải tổng. */
export function invoiceRemainingAmount(invoice: SubscriptionInvoice): string {
  return invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
    ? (subtractMoney(invoice.totalAmount, invoice.paidAmount) ?? invoice.totalAmount)
    : invoice.totalAmount;
}

/**
 * THẺ HOÁ ĐƠN ĐANG CHỜ TIỀN — đang mua gì, còn phải trả bao nhiêu, trước khi nào, và MỘT nút sang
 * trang thanh toán (`/payment/:invoiceId`).
 *
 * Dùng ở đầu khối "Hoá đơn thanh toán" của trang gói, bước thanh toán của onboarding gian hàng và
 * của luồng nâng cấp từ tuyến hoa hồng. Từ 13/10/2026 việc TRẢ nằm ở trang thanh toán riêng: chuyển
 * khoản VietQR và ví điện tử ở cùng một chỗ, và đó cũng là trang cổng quay về. Thẻ này không vẽ mã
 * QR thứ hai — hai chỗ trả là hai chỗ để số tiền hoặc nội dung chuyển khoản trôi khỏi nhau.
 *
 * Hoá đơn `partially_paid` nói SỐ CÒN THIẾU — bắt người chuyển thiếu tự trừ nhẩm là cách nhận thêm
 * một lần chuyển sai.
 */
export function InvoicePaymentPanel({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const partial = invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const remaining = invoiceRemainingAmount(invoice);

  return (
    <div className={styles.panel}>
      <InvoicePlanSummary invoice={invoice} />

      {partial ? (
        <Alert type="warning" showIcon title={t('partialIntro', { paid: fmt.money(invoice.paidAmount) })} />
      ) : null}

      <div className={styles.due}>
        <div className={styles.dueText}>
          <span className={styles.dueLabel}>{partial ? t('remainingLabel') : t('amount')}</span>
          <b className={styles.dueAmount}>{fmt.money(remaining)}</b>
          {/* Mã là thứ người dùng đọc cho hỗ trợ và nhận ra trên sao kê — chép được. */}
          <span className={styles.dueCode}>
            {t('code')}: <b>{invoice.code}</b>
            <CopyButton value={invoice.code} label={t('copyCode')} />
          </span>
          {invoice.expiresAt ? (
            <span className={styles.dueMeta}>
              {t('expires', { date: fmt.dateTime(invoice.expiresAt) })}
            </span>
          ) : null}
        </div>
        <Link href={paymentPath.invoice(invoice.id)} className={styles.payLink}>
          <Button type="primary" size="large" icon={<CreditCardOutlined aria-hidden />}>
            {t('payNow')}
          </Button>
        </Link>
      </div>

      <p className={styles.note}>{t('autoActivateNote')}</p>
    </div>
  );
}
