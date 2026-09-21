'use client';

import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import type { SubscriptionInvoice } from '../types';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import styles from './InvoiceWaitingPanel.module.css';

/**
 * MÀN CHỜ TIỀN của một hoá đơn gói: một dòng trạng thái + hướng dẫn chuyển khoản.
 *
 * Dùng chung bởi bước 2 của onboarding gian hàng trả phí (`PackageShopCheckout`) và bước 3 của
 * luồng nâng cấp từ tuyến hoa hồng (`PackageUpgradeWizard`). Hai luồng dẫn tới ĐÚNG một trạng
 * thái — "hoá đơn đã tạo, đang chờ đối soát" — nên chúng phải nói cùng một câu và hiện cùng một
 * QR; hai bản là hai chỗ để một lần sửa nội dung chuyển khoản chỉ đúng ở một nửa số người dùng.
 *
 * Trạng thái nói bằng CHỮ, không chỉ bằng màu của một thẻ. "Đang chờ tiền về" và "đã nhận một
 * phần" là hai tình huống khác nhau với hai việc phải làm khác nhau, và người không phân biệt
 * được màu vẫn phải đọc ra được mình đang ở đâu.
 *
 * KHÔNG có nút "Tôi đã chuyển khoản": kích hoạt gói là việc của webhook SePay trong cùng
 * transaction với dòng `bank_transactions` (ADR 0022). Một nút tự khai đã trả tiền là một đường
 * mở Manage không qua tiền.
 */
export function InvoiceWaitingPanel({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription.payment');

  return (
    <div className={styles.panel}>
      <p className={styles.status} aria-live="polite">
        {invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
          ? t('statusPartial')
          : t('statusWaiting')}
      </p>
      <InvoicePaymentPanel invoice={invoice} />
    </div>
  );
}
