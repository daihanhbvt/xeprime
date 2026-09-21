import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

import { usePlanPurchase } from '../plan-purchase';
import {
  usePendingInvoice,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import { PlanPricingTable } from './PlanPricingTable';

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
export function PackageShopCheckout() {
  const t = useTranslations('ShopOnboarding.checkout');
  /*
   * Dòng TRẠNG THÁI chờ tiền đọc từ `Subscription.payment`, không phải namespace của onboarding:
   * cùng một câu xuất hiện ở mọi màn chờ đối soát một hoá đơn gói (onboarding gian hàng trả phí,
   * và luồng nâng cấp từ tuyến hoa hồng bên web), nên nó sống cạnh phần còn lại của hướng dẫn
   * chuyển khoản. Hai bản của cùng một câu là hai chỗ để một lần sửa chỉ đúng với một nửa người dùng.
   */
  const tPayment = useTranslations('Subscription.payment');
  const errorMessage = useErrorMessage();

  const pending = usePendingInvoice();
  const invoice = pending.data ?? null;
  /*
   * Danh mục gói chỉ tải khi CHƯA có hoá đơn chờ: khi đã có mã để chuyển khoản thì bảng giá không
   * còn là thứ người dùng đang quyết định, và một request nữa lúc đó chỉ làm màn thanh toán hiện
   * ra chậm hơn.
   */
  const plans = useTenantPlans(!pending.isLoading && invoice === null);
  const purchase = usePurchaseSubscription();
  const selection = usePlanPurchase(plans.data ?? []);

  if (pending.isLoading) return <MiniRowsSkeleton rows={6} />;

  if (pending.isError && !pending.data) {
    return <RetryNotice title={t('loadError')} onRetry={() => void pending.refetch()} />;
  }

  if (invoice) {
    return (
      <YStack gap={space.md}>
        {/*
          Trạng thái nói bằng CHỮ, không chỉ bằng màu của một viên nhãn. "Đang chờ tiền về" và "đã
          nhận một phần" là hai tình huống khác nhau với hai việc phải làm khác nhau, và người
          không phân biệt được màu vẫn phải đọc ra được mình đang ở đâu.
        */}
        <Text
          accessibilityLiveRegion="polite"
          col={colors.textMuted}
          fos={fontSize.bodySm}
          fow={fontWeight.medium}
        >
          {invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
            ? tPayment('statusPartial')
            : tPayment('statusWaiting')}
        </Text>
        <InvoicePaymentPanel invoice={invoice} />
      </YStack>
    );
  }

  if (plans.isLoading) return <MiniRowsSkeleton rows={6} />;

  if (plans.isError) {
    return <RetryNotice title={t('plansError')} onRetry={() => void plans.refetch()} />;
  }

  /*
   * Danh mục không có bậc gói nào đang bán = lỗi cấu hình phía nền tảng, không phải lựa chọn của
   * người dùng. Nói thẳng và cho đường liên hệ thay vì hiện một form không bấm được.
   */
  if (selection.tiers.length === 0) {
    return (
      <Callout tone="warning" title={t('noPlans')}>
        <CalloutBody>{t('noPlansHint')}</CalloutBody>
      </Callout>
    );
  }

  return (
    <YStack gap={space.md}>
      {purchase.isError ? <Callout tone="danger" title={errorMessage(purchase.error)} /> : null}

      <PlanPricingTable state={selection} />

      {/*
        Quy chế sàn là văn bản quy định phí dịch vụ và thứ tự hiển thị mà gian hàng đang mua — đây
        là khoảnh khắc nó bắt đầu ràng buộc họ (ADR 0028 điều 9).
      */}
      <LegalConsentNote place="subscription" />

      <Button
        label={t('createInvoice')}
        loading={purchase.isPending}
        disabled={!selection.selection}
        onPress={() => {
          if (selection.selection) purchase.mutate(selection.selection.body);
        }}
      />
      {/*
        Nút mờ phải nói VÌ SAO. Không có dòng này, người dùng chọn số chỗ xong thấy nút xám và
        không có cách nào biết mình còn thiếu một cú chạm vào thẻ kỳ hạn.
      */}
      {selection.selection ? null : (
        <Text col={colors.textMuted} fos={fontSize.label} ta="center">
          {t('pickTermFirst')}
        </Text>
      )}
    </YStack>
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
