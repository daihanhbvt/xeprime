'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';

import { useErrorMessage } from '@/i18n/use-error-message';

import { usePlanPurchase } from '../plan-purchase';
import {
  usePendingInvoice,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import { InvoiceWaitingPanel } from './InvoiceWaitingPanel';
import { PlanPickerPanel } from './PlanPickerPanel';

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

  // Dải chờ tiền dùng CHUNG với luồng nâng cấp tuyến hoa hồng — cùng một trạng thái thì cùng một
  // câu chữ và cùng một QR (`InvoiceWaitingPanel`).
  if (invoice) return <InvoiceWaitingPanel invoice={invoice} />;

  /*
   * Bảng giá + quy chế + nút cũng dùng CHUNG (`PlanPickerPanel`). Màn này chỉ còn quyết định hai
   * thứ mà nơi khác không biết: câu chữ của chính luồng onboarding, và việc bấm nút nghĩa là TẠO
   * HOÁ ĐƠN ngay (ở luồng nâng cấp, nó còn một bước hồ sơ ở giữa).
   */
  return (
    <PlanPickerPanel
      plans={plans}
      state={selection}
      submitting={purchase.isPending}
      errorText={purchase.isError ? errorMessage(purchase.error) : null}
      copy={{
        loadError: t('plansError'),
        empty: t('noPlans'),
        emptyHint: t('noPlansHint'),
        submit: t('createInvoice'),
        pickTermHint: t('pickTermFirst'),
      }}
      onSubmit={() => {
        if (selection.selection) purchase.mutate(selection.selection.body);
      }}
    />
  );
}
