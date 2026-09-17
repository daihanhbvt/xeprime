'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useErrorMessage } from '@/i18n/use-error-message';

import { usePlanPurchase } from '../plan-purchase';
import {
  usePendingInvoice,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import { PlanPricingTable } from './PlanPricingTable';
import styles from './PackageShopCheckout.module.css';

/**
 * BƯỚC 2 của onboarding gian hàng trả phí: chọn gói → chuyển khoản (ADR 0040).
 *
 * ## Trạng thái đến từ SERVER, không từ state của component
 *
 * Màn này có hai hình dạng, và cái nào hiện ra do `GET /subscription/invoices/pending` quyết định
 * — không phải một cờ `hasSubmitted` nào:
 *
 *   không có hoá đơn chờ  → bộ chọn gói + nút "Tạo hoá đơn"
 *   có hoá đơn chờ        → QR, số còn thiếu, mã đối soát, trạng thái
 *
 * Đó là toàn bộ lý do nó phục hồi được: F5, đóng trình duyệt, đăng nhập trên máy khác — cả ba
 * rơi đúng vào hình dạng thứ hai, với đúng mã cũ. Một `useState` ở đây sẽ mất sau lần F5 đầu
 * tiên và mời người dùng tạo mã thứ hai cho cùng một khoản.
 *
 * ## Không có nút "Tôi đã chuyển khoản"
 *
 * Kích hoạt gói là việc của webhook SePay trong cùng transaction với dòng `bank_transactions`
 * (ADR 0022). `usePendingInvoice` tự hỏi lại theo nhịp và dừng khi hoá đơn tới trạng thái kết
 * thúc; nơi gọi theo dõi `onPaid` để làm mới scope rồi điều hướng. Một nút tự khai đã trả tiền
 * là một đường mở Manage không qua tiền.
 *
 * ## Chuyển thiếu thì vẫn ở đây
 *
 * `partially_paid` KHÔNG phải trạng thái kết thúc: `InvoicePaymentPanel` hiện SỐ CÒN THIẾU và QR
 * mang đúng số đó, và màn này giữ nguyên chỗ. Gọi nó là "đã thanh toán" vì đã có tiền về là mở
 * Manage cho một khoản chưa đủ.
 */
export function PackageShopCheckout() {
  const t = useTranslations('ShopOnboarding.checkout');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();

  const pending = usePendingInvoice();
  const invoice = pending.data ?? null;
  /*
   * Danh mục gói chỉ tải khi CHƯA có hoá đơn chờ: khi đã có mã để chuyển khoản thì bảng giá
   * không còn là thứ người dùng đang quyết định, và một request nữa lúc đó chỉ làm màn thanh
   * toán hiện ra chậm hơn.
   */
  const plans = useTenantPlans(!pending.isLoading && invoice === null);
  const purchase = usePurchaseSubscription();
  const selection = usePlanPurchase(plans.data ?? []);

  if (pending.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (pending.isError && !pending.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('loadError')}
        action={
          <Button size="small" onClick={() => void pending.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  if (invoice) {
    return (
      <div className={styles.panel}>
        {/*
          Trạng thái nói bằng CHỮ, không chỉ bằng màu của một thẻ. "Đang chờ tiền về" và "đã nhận
          một phần" là hai tình huống khác nhau với hai việc phải làm khác nhau, và người không
          phân biệt được màu vẫn phải đọc ra được mình đang ở đâu.
        */}
        <p className={styles.status} aria-live="polite">
          {invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
            ? t('statusPartial')
            : t('statusWaiting')}
        </p>
        <InvoicePaymentPanel invoice={invoice} />
      </div>
    );
  }

  if (plans.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (plans.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('plansError')}
        action={
          <Button size="small" onClick={() => void plans.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  /*
   * Danh mục không có bậc gói nào đang bán = lỗi cấu hình phía nền tảng, không phải lựa chọn của
   * người dùng. Nói thẳng và cho đường liên hệ thay vì hiện một form không bấm được.
   */
  if (selection.tiers.length === 0) {
    return <Alert type="warning" showIcon title={t('noPlans')} description={t('noPlansHint')} />;
  }

  return (
    <div className={styles.panel}>
      {purchase.isError ? (
        <Alert type="error" showIcon title={errorMessage(purchase.error)} />
      ) : null}

      <PlanPricingTable state={selection} />

      {/*
        Quy chế sàn là văn bản quy định phí dịch vụ và thứ tự hiển thị mà gian hàng đang mua —
        đây là khoảnh khắc nó bắt đầu ràng buộc họ (ADR 0028 điều 9).
      */}
      <LegalConsentNote place="subscription" className={styles.consent} />

      <Button
        type="primary"
        size="large"
        block
        loading={purchase.isPending}
        disabled={!selection.selection}
        onClick={() => {
          if (selection.selection) purchase.mutate(selection.selection.body);
        }}
      >
        {t('createInvoice')}
      </Button>
      {/*
        Nút mờ phải nói VÌ SAO. Không có dòng này, người dùng chọn số chỗ xong thấy nút xám và
        không có cách nào biết mình còn thiếu một cú bấm vào thẻ kỳ hạn.
      */}
      {selection.selection ? null : <p className={styles.disabledHint}>{t('pickTermFirst')}</p>}
    </div>
  );
}
