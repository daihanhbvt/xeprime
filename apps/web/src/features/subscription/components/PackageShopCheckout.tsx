'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { paymentPath } from '@/constants/routes';
import { cx } from '@/lib/cx';

import { onePerPaymentTarget } from '../payable';
import { PLAN_LANE_SCOPES, pendingInvoiceForScope } from '../plan-lanes';
import { useMySubscription, usePendingInvoices } from '../hooks/use-subscription';
import { InvoiceWaitingPanel } from './InvoiceWaitingPanel';
import { PlanPurchasePage } from './PlanPurchaseDialog';
import styles from './PackageShopCheckout.module.css';

/**
 * BƯỚC 2 của onboarding gian hàng trả phí: chọn gói xe máy và/hoặc ô tô → chuyển khoản
 * (ADR 0040 · ADR 0065).
 *
 * ## Cùng luồng với "Mua hoặc gia hạn gói", ở dạng TRANG
 *
 * Người dùng 18/11/2026: màn chọn gói ở đây dùng ĐÚNG luồng hai bước của hộp mua gói ở trang Gian
 * hàng (`PlanPurchasePage` - cùng `PlanPurchaseFlow`): (1) chọn bậc từng loại xe, (2) MỘT kỳ hạn
 * chung + xác nhận từ bản xem trước của server. Một gói ⇒ một hoá đơn `XPG…`; hai gói ⇒ MỘT phiếu
 * thanh toán gộp `XPC…` với một mã QR (ADR 0083). Tạo xong là sang thẳng trang thanh toán không
 * khung (`paymentPath` - gian hàng chưa vào được khu quản lý).
 *
 * ## Trạng thái đến từ SERVER, không từ state của component
 *
 *   không có hoá đơn chờ  → luồng chọn gói
 *   có hoá đơn chờ        → mỗi khoản cần trả một khối chờ tiền (phiếu gộp là MỘT khối)
 *
 * Đó là toàn bộ lý do nó phục hồi được: F5, đóng trình duyệt, đăng nhập trên máy khác — cả ba
 * rơi đúng vào hình dạng thứ hai, với đúng mã cũ. Ngoại lệ tường minh duy nhất: người dùng bấm
 * "Chọn lại gói" / "Thêm gói …" - luồng mở lại, bước xác nhận cảnh báo mã cũ của loại xe được chọn
 * lại sẽ bị huỷ (server void `issued` cùng loại xe; một con void thì cả phiếu void), "Huỷ" quay về
 * mã đang chờ.
 *
 * ## Không có nút "Tôi đã chuyển khoản"
 *
 * Kích hoạt gói là việc của webhook SePay trong cùng transaction với dòng `bank_transactions`
 * (ADR 0022); `usePendingInvoices` tự hỏi lại theo nhịp, trang onboarding làm mới scope khi một
 * hoá đơn rời trạng thái chờ. Một nút tự khai đã trả tiền là một đường mở Manage không qua tiền.
 *
 * KHÔNG có gói hoa hồng tạm ở đây (ADR 0040 điều 2): người đăng ký tuyến gói nhận gói THẬT lúc
 * tiền về.
 */
export function PackageShopCheckout({
  purchaseLocked = false,
}: {
  /**
   * Chưa mua gói được (gian hàng còn thiếu logo - ADR 0103): chỉ hiện mã đang chờ nếu có, không
   * luồng chọn gói, không lối mở lại. Không có mã nào thì không vẽ gì.
   */
  purchaseLocked?: boolean;
}) {
  const t = useTranslations('ShopOnboarding.checkout');

  const pending = usePendingInvoices();
  const invoices = pending.data ?? [];
  /** Người dùng mở lại luồng chọn gói trong khi đang có hoá đơn chờ. */
  const [editing, setEditing] = useState(false);
  const showFlow = !purchaseLocked && !pending.isLoading && (invoices.length === 0 || editing);
  const me = useMySubscription(showFlow);

  if (purchaseLocked && invoices.length === 0) return null;

  if (pending.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (pending.isError && !pending.data) {
    return <LoadError title={t('loadError')} onRetry={() => void pending.refetch()} />;
  }

  if (showFlow) {
    if (me.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
    if (!me.data) {
      return <LoadError title={t('plansError')} onRetry={() => void me.refetch()} />;
    }
    return (
      <PlanPurchasePage
        data={me.data}
        paths={paymentPath}
        onCancel={invoices.length > 0 ? () => setEditing(false) : undefined}
      />
    );
  }

  /** Loại xe chưa có hoá đơn chờ - còn thêm gói được mà không đụng tới mã nào. */
  const openScopes = PLAN_LANE_SCOPES.filter((scope) => !pendingInvoiceForScope(invoices, scope));
  const [onlyOpenScope] = openScopes;
  /*
   * "Chọn lại gói" chỉ khi MỌI hoá đơn chờ chưa nhận đồng nào: hoá đơn đã nhận một phần thì server
   * từ chối tạo mã mới (`SUBSCRIPTION_INVOICE_PARTIALLY_PAID`), và một nút dẫn tới lỗi đó là một
   * nút nói dối. Còn loại xe trống thì lối là "Thêm gói …".
   */
  const canEdit = invoices.every((item) => item.status === SUBSCRIPTION_INVOICE_STATUS.ISSUED);
  const reopenLabel = purchaseLocked
    ? null
    : openScopes.length === 1 && onlyOpenScope
      ? t('addOtherScope', { scope: t(`scope.${onlyOpenScope}`) })
      : openScopes.length > 1
        ? t('addPlan')
        : canEdit
          ? t('editInvoice')
          : null;

  return (
    // Đứng dưới bước logo trong cùng một khung: một vạch ngăn cho mắt biết đó là hai việc.
    <div className={cx(styles.wrap, purchaseLocked && styles.belowStep)}>
      {/* Dải chờ tiền dùng CHUNG với luồng nâng cấp — cùng một trạng thái thì cùng một câu chữ. */}
      {onePerPaymentTarget(invoices).map((invoice) => (
        <InvoiceWaitingPanel key={invoice.id} invoice={invoice} />
      ))}
      {reopenLabel ? (
        <div className={styles.actions}>
          <Button onClick={() => setEditing(true)}>{reopenLabel}</Button>
        </div>
      ) : null}
    </div>
  );
}

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  const tCommon = useTranslations('Common');
  return (
    <Alert
      type="error"
      showIcon
      title={title}
      action={
        <Button size="small" onClick={onRetry}>
          {tCommon('actions.retry')}
        </Button>
      }
    />
  );
}
