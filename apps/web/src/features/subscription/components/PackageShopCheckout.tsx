'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { paymentPath } from '@/constants/routes';

import { usePurchaseErrorMessage } from '../use-plan-quota-gate-message';

import { PLAN_LANE_SCOPES, pendingInvoiceForScope } from '../plan-lanes';
import { useScopedPlanPurchase } from '../plan-purchase';
import {
  usePendingInvoices,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import { useCreateScopedInvoices } from '../use-create-scoped-invoices';
import { InvoiceWaitingPanel } from './InvoiceWaitingPanel';
import { PlanPickerPanel } from './PlanPickerPanel';
import styles from './PackageShopCheckout.module.css';

/**
 * BƯỚC 2 của onboarding gian hàng trả phí: chọn gói xe máy và/hoặc ô tô → chuyển khoản
 * (ADR 0040 · ADR 0065).
 *
 * ## Trạng thái đến từ SERVER, không từ state của component
 *
 * Màn này có hai hình dạng, và cái nào hiện ra do `GET /subscription/invoices/pending` quyết định
 * — không phải một cờ `hasSubmitted` nào:
 *
 *   không có hoá đơn chờ  → bộ chọn hai làn + nút "Tạo hoá đơn"
 *   có hoá đơn chờ        → mỗi hoá đơn (tối đa một mỗi loại xe) một khối chờ tiền
 *
 * Đó là toàn bộ lý do nó phục hồi được: F5, đóng trình duyệt, đăng nhập trên máy khác — cả ba
 * rơi đúng vào hình dạng thứ hai, với đúng mã cũ.
 *
 * ## Mỗi loại xe một hoá đơn
 *
 * Chọn cả xe máy lẫn ô tô là HAI hoá đơn (server giữ tối đa một hoá đơn mở mỗi phạm vi), tạo lần
 * lượt. Một hoá đơn → sang thẳng trang thanh toán của nó. Hai hoá đơn → ở lại đây, mỗi hoá đơn một
 * nút "Thanh toán": trả xong MỘT là gian hàng đã vào tuyến gói (ADR 0065 điều 5), hoá đơn còn lại
 * vẫn chờ ở trang gói.
 *
 * Tạo hoá đơn thứ hai hỏng thì hoá đơn thứ nhất VẪN đã có — màn hình hiện nó cùng lỗi, và lối
 * "Thêm gói cho loại xe còn lại" mở bộ chọn chỉ cho làn chưa có hoá đơn.
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
export function PackageShopCheckout() {
  const t = useTranslations('ShopOnboarding.checkout');
  const tCommon = useTranslations('Common');
  const errorMessage = usePurchaseErrorMessage();
  const router = useRouter();

  const pending = usePendingInvoices();
  const invoices = pending.data ?? [];
  /** Người dùng bấm "Thêm gói cho loại xe còn lại" khi đã có hoá đơn chờ ở một làn. */
  const [addingMore, setAddingMore] = useState(false);

  /** Làn còn mua được: chưa có hoá đơn chờ ở phạm vi đó. */
  const openScopes = PLAN_LANE_SCOPES.filter((scope) => !pendingInvoiceForScope(invoices, scope));
  const [onlyOpenScope] = openScopes;
  const showPicker = !pending.isLoading && (invoices.length === 0 || addingMore);
  /*
   * Danh mục gói chỉ tải khi bộ chọn sắp hiện ra: khi đã có mã để chuyển khoản thì bảng giá không
   * còn là thứ người dùng đang quyết định, và một request nữa lúc đó chỉ làm màn thanh toán chậm hơn.
   */
  const plans = useTenantPlans(showPicker || invoices.length > 0);
  const purchase = usePurchaseSubscription();
  const selection = useScopedPlanPurchase(plans.data ?? [], openScopes);
  const create = useCreateScopedInvoices(purchase);

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

  async function submit() {
    if (create.running || selection.selections.length === 0) return;
    const result = await create.run(selection.selections);
    if (result.created.length === 0) return;
    selection.reset();
    setAddingMore(false);
    // Một hoá đơn, không lỗi ⇒ sang thẳng trang thanh toán của nó. Hai hoá đơn ⇒ ở lại, mỗi mã một nút.
    const [only] = result.created;
    if (result.created.length === 1 && only && !result.failed) {
      router.push(paymentPath.invoice(only.id));
    }
  }

  const failedText = create.failed
    ? t('partialFailure', {
        scope: t(`scope.${create.failed.scope}`),
        error: errorMessage(create.failed.error),
      })
    : null;

  return (
    <div className={styles.wrap}>
      {/* Dải chờ tiền dùng CHUNG với luồng nâng cấp — cùng một trạng thái thì cùng một câu chữ. */}
      {invoices.map((invoice) => (
        <InvoiceWaitingPanel key={invoice.id} invoice={invoice} />
      ))}

      {invoices.length > 0 && failedText ? (
        <Alert type="error" showIcon title={failedText} />
      ) : null}

      {invoices.length > 0 && !addingMore && openScopes.length > 0 ? (
        <Button className={styles.addMore} onClick={() => setAddingMore(true)}>
          {openScopes.length === 1 && onlyOpenScope
            ? t('addOtherScope', { scope: t(`scope.${onlyOpenScope}`) })
            : t('addPlan')}
        </Button>
      ) : null}

      {showPicker ? (
        <PlanPickerPanel
          plans={plans}
          state={selection}
          submitting={create.running}
          errorText={invoices.length === 0 ? failedText : null}
          copy={{
            loadError: t('plansError'),
            empty: t('noPlans'),
            emptyHint: t('noPlansHint'),
            submit: t('createInvoice'),
          }}
          onSubmit={() => void submit()}
        />
      ) : null}

      {addingMore ? (
        <Button type="link" onClick={() => setAddingMore(false)}>
          {tCommon('actions.cancel')}
        </Button>
      ) : null}
    </div>
  );
}
