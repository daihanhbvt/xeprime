'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { invoicePaymentHref } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useSubscriptionCheckout } from '../hooks/use-subscription';
import {
  payableOfCheckout,
  payableOfInvoice,
  payableRemainingAmount,
  type Payable,
} from '../payable';
import type { SubscriptionInvoice } from '../types';
import { InvoicePlanSummary } from './InvoicePlanSummary';
import styles from './InvoicePaymentPanel.module.css';

/**
 * THẺ HOÁ ĐƠN ĐANG CHỜ TIỀN - đang mua gì, còn phải trả bao nhiêu, trước khi nào, và MỘT nút sang
 * trang thanh toán (`/payment/:invoiceId`, hoặc `/payment/checkout/:id` cho phiếu gộp).
 *
 * Dùng ở đầu khối "Hoá đơn thanh toán" của trang gói, bước thanh toán của onboarding gian hàng và
 * của luồng nâng cấp từ tuyến hoa hồng. Từ 13/10/2026 việc TRẢ nằm ở trang thanh toán riêng: chuyển
 * khoản VietQR và ví điện tử ở cùng một chỗ, và đó cũng là trang cổng quay về. Thẻ này không vẽ mã
 * QR thứ hai - hai chỗ trả là hai chỗ để số tiền hoặc nội dung chuyển khoản trôi khỏi nhau.
 *
 * Hoá đơn nằm trong PHIẾU GỘP (ADR 0083) thì thẻ nói bằng con số của PHIẾU: mã `XPC…`, tổng và phần
 * còn thiếu của cả cụm, mọi gói trong phiếu - xem `Payable`. Danh sách nhiều hoá đơn lọc qua
 * `onePerPaymentTarget` để một phiếu chỉ ra một thẻ.
 *
 * Khoản `partially_paid` nói SỐ CÒN THIẾU - bắt người chuyển thiếu tự trừ nhẩm là cách nhận thêm
 * một lần chuyển sai.
 */
export function InvoicePaymentPanel({ invoice }: { invoice: SubscriptionInvoice }) {
  const href = invoicePaymentHref(invoice);
  return invoice.checkoutId ? (
    <CheckoutPaymentPanel checkoutId={invoice.checkoutId} href={href} />
  ) : (
    <PayablePanel payable={payableOfInvoice(invoice)} href={href} />
  );
}

/** Phiếu gộp: số liệu đọc từ chính phiếu - hoá đơn con không mang tổng hay số đã nhận của cụm. */
function CheckoutPaymentPanel({ checkoutId, href }: { checkoutId: string; href: string }) {
  const t = useTranslations('Subscription.checkout');
  const tCommon = useTranslations('Common');
  const checkout = useSubscriptionCheckout(checkoutId);

  if (checkout.isPending) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (!checkout.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('loadErrorTitle')}
        action={
          <Button size="small" onClick={() => void checkout.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }
  return <PayablePanel payable={payableOfCheckout(checkout.data)} href={href} />;
}

function PayablePanel({ payable, href }: { payable: Payable; href: string }) {
  const t = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const partial = payable.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const remaining = payableRemainingAmount(payable);

  return (
    <div className={styles.panel}>
      {payable.invoices.map((invoice) => (
        <InvoicePlanSummary key={invoice.id} invoice={invoice} />
      ))}

      {partial ? (
        <Alert type="warning" showIcon title={t('partialIntro', { paid: fmt.money(payable.paidAmount) })} />
      ) : null}

      <div className={styles.due}>
        <div className={styles.dueText}>
          <span className={styles.dueLabel}>{partial ? t('remainingLabel') : t('amount')}</span>
          <b className={styles.dueAmount}>{fmt.money(remaining)}</b>
          {/* Mã là thứ người dùng đọc cho hỗ trợ và nhận ra trên sao kê - chép được. */}
          <span className={styles.dueCode}>
            {t('code')}: <b>{payable.code}</b>
            <CopyButton value={payable.code} label={t('copyCode')} />
          </span>
          {payable.expiresAt ? (
            <span className={styles.dueMeta}>
              {t('expires', { date: fmt.dateTime(payable.expiresAt) })}
            </span>
          ) : null}
        </div>
        <Link href={href} className={styles.payLink}>
          <Button type="primary" size="large" icon={<CreditCardOutlined aria-hidden />}>
            {t('payNow')}
          </Button>
        </Link>
      </div>

      <p className={styles.note}>{t('autoActivateNote')}</p>
    </div>
  );
}
