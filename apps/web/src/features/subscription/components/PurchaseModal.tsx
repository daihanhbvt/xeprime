'use client';

import { App, Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { paymentPath } from '@/constants/routes';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { PlanPricingTable } from './PlanPricingTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePlanPurchase } from '../plan-purchase';
import { usePurchaseSubscription, useTenantPlans } from '../hooks/use-subscription';
import styles from './PurchaseModal.module.css';

/**
 * Mua / gia hạn gói: chọn BẬC + KỲ HẠN → sinh HOÁ ĐƠN kèm mã đối soát. Gói chỉ kích hoạt khi
 * tiền về (ADR 0026 điều 4), nên hoá đơn tạo xong là modal đóng và người dùng sang thẳng TRANG
 * THANH TOÁN của hoá đơn đó (`/payment/:invoiceId` — chuyển khoản VietQR + ví điện tử). Trang đó
 * sống qua F5 và là nơi cổng quay về; một màn chuyển khoản trong modal thì không.
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
  const router = useRouter();

  function submit() {
    // Enter vẫn gửi form khi nút đang quay — không tạo hoá đơn thứ hai trong lúc lượt đầu đang bay.
    if (!selection.selection || purchase.isPending) return;
    purchase.mutate(selection.selection.body, {
      onSuccess: (created) => {
        close();
        router.push(paymentPath.invoice(created.id));
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function close() {
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
      title={t('purchase.title')}
      open={open}
      onClose={close}
      footer={null}
    >
      {plans.isLoading ? (
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
