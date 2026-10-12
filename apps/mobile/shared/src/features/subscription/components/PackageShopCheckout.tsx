import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useErrorMessage } from '@/i18n/use-error-message';

import { usePlanPurchase } from '../plan-purchase';
import {
  usePendingInvoice,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import { InvoiceWaitingPanel } from './InvoiceWaitingPanel';
import { PlanPickerPanel, PlanPickerSubmit } from './PlanPickerPanel';

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
 * Đó là toàn bộ lý do nó phục hồi được: tắt app, mở lại, đăng nhập trên máy khác — cả ba rơi đúng
 * vào hình dạng thứ hai, với đúng mã cũ. Một `useState` ở đây sẽ mất ngay lần app bị hệ điều hành
 * thu hồi và mời người dùng tạo mã thứ hai cho cùng một khoản.
 *
 * ## Không có nút "Tôi đã chuyển khoản"
 *
 * Kích hoạt gói là việc của webhook SePay trong cùng transaction với dòng `bank_transactions`
 * (ADR 0022). `usePendingInvoice` tự hỏi lại theo nhịp và dừng khi hoá đơn tới trạng thái kết
 * thúc; nơi gọi theo dõi điều đó để làm mới scope rồi điều hướng. Một nút tự khai đã trả tiền là
 * một đường mở Manage không qua tiền.
 *
 * ## Chuyển thiếu thì vẫn ở đây
 *
 * `partially_paid` KHÔNG phải trạng thái kết thúc: `InvoicePaymentPanel` hiện SỐ CÒN THIẾU và QR
 * mang đúng số đó, và màn này giữ nguyên chỗ. Gọi nó là "đã thanh toán" vì đã có tiền về là mở
 * Manage cho một khoản chưa đủ.
 */
/**
 * State của bước 2, gọi ở MÀN (không ở thân) để màn neo nút hành động vào `footer` của `Screen`.
 * `enabled = false` ở bước 1: hook phải gọi vô điều kiện, nhưng chưa có gian hàng thì không có
 * hoá đơn hay danh mục gói nào để hỏi.
 */
export function usePackageShopCheckout(enabled = true) {
  const pending = usePendingInvoice(enabled);
  const invoice = pending.data ?? null;
  /*
   * Danh mục gói chỉ tải khi CHƯA có hoá đơn chờ: khi đã có mã để chuyển khoản thì bảng giá không
   * còn là thứ người dùng đang quyết định, và một request nữa lúc đó chỉ làm màn thanh toán hiện
   * ra chậm hơn.
   */
  const plans = useTenantPlans(enabled && !pending.isLoading && invoice === null);
  const purchase = usePurchaseSubscription();
  const selection = usePlanPurchase(plans.data ?? []);
  const submit = () => {
    if (selection.selection) purchase.mutate(selection.selection.body);
  };
  /*
   * Nút "Tạo hoá đơn" chỉ có nghĩa ở hình dạng BỘ CHỌN GÓI có danh mục thật — đang tải, lỗi,
   * danh mục rỗng hay đã có hoá đơn chờ thì không có gì để bấm.
   */
  const pickerReady =
    enabled &&
    !pending.isLoading &&
    !(pending.isError && !pending.data) &&
    invoice === null &&
    !plans.isLoading &&
    !plans.isError &&
    selection.tiers.length > 0;
  return { pending, invoice, plans, purchase, selection, submit, pickerReady };
}

export type PackageShopCheckoutState = ReturnType<typeof usePackageShopCheckout>;

/**
 * Thân bước 2. Nút hành động KHÔNG nằm ở đây mà ở `PackageShopCheckoutAction`, để màn gọi neo nó
 * vào `footer` của `Screen` — cả hai đọc cùng MỘT `usePackageShopCheckout` của nơi gọi.
 */
export function PackageShopCheckout({ checkout }: { checkout: PackageShopCheckoutState }) {
  const t = useTranslations('ShopOnboarding.checkout');
  const errorMessage = useErrorMessage();
  const { pending, invoice, plans, purchase, selection, submit } = checkout;

  if (pending.isLoading) return <MiniRowsSkeleton rows={6} />;

  if (pending.isError && !pending.data) {
    return <RetryNotice title={t('loadError')} onRetry={() => void pending.refetch()} />;
  }

  // Dải chờ tiền dùng CHUNG với luồng nâng cấp tuyến hoa hồng — cùng một trạng thái thì cùng một
  // câu chữ và cùng một QR (`InvoiceWaitingPanel`).
  if (invoice) return <InvoiceWaitingPanel invoice={invoice} />;

  return (
    <PlanPickerPanel
      plans={plans}
      state={selection}
      submitting={purchase.isPending}
      errorText={purchase.isError ? errorMessage(purchase.error) : null}
      showSubmit={false}
      copy={{
        loadError: t('plansError'),
        empty: t('noPlans'),
        emptyHint: t('noPlansHint'),
      }}
      onSubmit={submit}
    />
  );
}

/** Nút "Tạo hoá đơn" của bước 2 — neo ở đáy màn; `null` khi không ở hình dạng bộ chọn gói. */
export function PackageShopCheckoutAction({ checkout }: { checkout: PackageShopCheckoutState }) {
  const t = useTranslations('ShopOnboarding.checkout');
  const { pickerReady, purchase, selection, submit } = checkout;
  if (!pickerReady) return null;
  return (
    <PlanPickerSubmit
      label={t('createInvoice')}
      hint={t('pickTermFirst')}
      submitting={purchase.isPending}
      selected={selection.selection != null}
      onSubmit={submit}
    />
  );
}

/**
 * Dải lỗi GỌN kèm nút thử lại — không phải `ScreenError`.
 *
 * `ScreenError` dựng `ScreenMessage` với `f={1}`: một trạng thái rỗng chiếm trọn màn. Ở đây nó
 * nằm trong thẻ bước 2, dưới chỉ dẫn bước và trên lối lui, nên một khối căn giữa cao bằng màn
 * hình đẩy toàn bộ ngữ cảnh ra khỏi tầm nhìn. Web cũng dùng một `Alert` gọn với nút thử lại nhỏ.
 */
function RetryNotice({ title, onRetry }: { title: string; onRetry: () => void }) {
  const tCommon = useTranslations('Common.actions');
  return (
    <Callout tone="danger" title={title}>
      <Button label={tCommon('retry')} variant="secondary" size="sm" onPress={onRetry} />
    </Callout>
  );
}
