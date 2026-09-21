'use client';

import { App, Button, Spin } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import { PlanPricingTable } from './PlanPricingTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePlanPurchase } from '../plan-purchase';
import { usePurchaseSubscription, useTenantPlans } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import styles from './PurchaseModal.module.css';

/**
 * Mua / gia hạn gói: chọn BẬC + KỲ HẠN → sinh HOÁ ĐƠN kèm mã đối soát. Gói chỉ kích hoạt khi
 * tiền về (ADR 0026 điều 4), nên modal chuyển sang màn "chuyển khoản" ngay khi hoá đơn tạo xong
 * để mã không bị bỏ lỡ.
 *
 * Bảng giá và toàn bộ phép đọc giá nằm ở `usePlanPurchase` + `PlanPricingTable`, dùng CHUNG với
 * bước 2 của onboarding gian hàng trả phí (ADR 0040 · ADR 0041). Modal này chỉ còn là VỎ: quyền,
 * hộp thoại, nút, và chuyển màn sau khi hoá đơn tạo xong.
 */
export function PurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  const plans = useTenantPlans(open);
  const purchase = usePurchaseSubscription();
  const selection = usePlanPurchase(plans.data ?? []);

  /** Hoá đơn vừa tạo — có giá trị là modal đang ở màn "chuyển khoản". */
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);

  function submit() {
    if (!selection.selection) return;
    purchase.mutate(selection.selection.body, {
      onSuccess: (created) => setInvoice(created),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function close() {
    setInvoice(null);
    /*
     * Dọn LỰA CHỌN, không chỉ dọn hoá đơn: hộp thoại này không bị tháo khỏi cây khi đóng, nên
     * không có lần remount nào dọn hộ. Thiếu dòng này thì mở lại thấy một kỳ hạn đã sáng — và
     * ngay sau một lượt mua thành công, đó là một cú bấm tới hoá đơn thứ hai.
     */
    selection.reset();
    onClose();
  }

  return (
    <ResponsiveDialog
      title={invoice ? t('payment.title') : t('purchase.title')}
      open={open}
      onClose={close}
      footer={null}
    >
      {invoice ? (
        <div className={styles.payment}>
          {/* R2: hướng dẫn chuyển khoản (kèm VietQR khi đã cấu hình) dùng CHUNG với trang
              "Gói của tôi" — đóng modal rồi vẫn tìm lại được cùng một QR ở đó. */}
          <InvoicePaymentPanel invoice={invoice} />
          <div className={styles.actions}>
            <Button type="primary" onClick={close}>
              {t('payment.done')}
            </Button>
          </div>
        </div>
      ) : plans.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : plans.isError ? (
        <div className={styles.empty}>
          {t('purchase.loadError')}{' '}
          <Button size="small" type="link" onClick={() => void plans.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        </div>
      ) : selection.tiers.length === 0 ? (
        <div className={styles.empty}>{t('purchase.empty')}</div>
      ) : (
        <>
          <PlanPricingTable state={selection} />

          {/*
            Đây là lần duy nhất gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy
            định phí dịch vụ với thứ tự hiển thị mà họ đang mua. Cổng quản lý không có chân
            trang marketplace nên nếu không đặt ở đây thì không có đường nào khác.
          */}
          <LegalConsentNote place="subscription" className={styles.consent} />

          <div className={styles.actions}>
            {/*
              Tổng tiền đứng CẠNH nút tạo hoá đơn, không nằm trong bảng giá: đây là con số người
              dùng xác nhận khi bấm, nên nó phải ở trong tầm mắt của chính cú bấm đó.
              `aria-live` vì nó đổi do một cú bấm ở chỗ khác trên màn hình.
            */}
            <span className={styles.total} aria-live="polite">
              {selection.total == null
                ? t('purchase.pickTerm')
                : t('purchase.total', { amount: fmt.money(String(selection.total)) })}
            </span>
            <Button onClick={close}>{tCommon('actions.close')}</Button>
            <Button
              type="primary"
              loading={purchase.isPending}
              disabled={!selection.selection}
              onClick={submit}
            >
              {t('purchase.submit')}
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
