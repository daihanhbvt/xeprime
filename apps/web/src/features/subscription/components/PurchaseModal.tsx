'use client';

import { Alert, App, Button, Radio, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_CHANGE_TIMING } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { paymentPath } from '@/constants/routes';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { PlanPricingTable } from './PlanPricingTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePurchaseErrorMessage } from '../use-plan-quota-gate-message';
import { packagePlansForScope, pendingInvoiceForScope, type PlanLaneScope } from '../plan-lanes';
import { usePlanPurchase } from '../plan-purchase';
import {
  usePendingInvoices,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import type { CurrentPlan } from '../types';
import styles from './PurchaseModal.module.css';

/**
 * Mua / gia hạn gói cho MỘT loại xe (ADR 0065): chọn BẬC (1 / 5 / 10 xe) + KỲ HẠN → sinh HOÁ ĐƠN
 * kèm mã đối soát. Gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4), nên hoá đơn tạo xong là modal
 * đóng và người dùng sang thẳng TRANG THANH TOÁN của hoá đơn đó (`/payment/:invoiceId`).
 *
 * Kỳ mới bắt đầu lúc nào là việc của SERVER (`planSubscriptionChain` theo phạm vi): còn kỳ cùng loại
 * xe ⇒ nối sau nó; chưa có ⇒ bắt đầu ngay khi tiền về — kể cả khi loại xe kia đang có gói. Modal chỉ
 * NÓI trước điều đó; kỳ thật in trên hoá đơn (`periodFrom`).
 *
 * Bảng giá và toàn bộ phép đọc giá nằm ở `usePlanPurchase` + `PlanPricingTable`. Modal này chỉ còn
 * là VỎ: quyền, hộp thoại, nút, và chuyển màn sau khi hoá đơn tạo xong. Nơi gọi KHÔNG dựng nó khi
 * thiếu `subscription.purchase`.
 */
export function PurchaseModal({
  open,
  scope,
  current,
  onClose,
}: {
  open: boolean;
  /** Làn đang mua. Giữ giá trị cuối khi đóng để hiệu ứng đóng không nháy sang làn khác. */
  scope: PlanLaneScope;
  /** Kỳ đang chạy CÙNG loại xe — để nói trước kỳ mới nối tiếp lúc nào. */
  current: CurrentPlan | null;
  onClose: () => void;
}) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = usePurchaseErrorMessage();
  const { message } = App.useApp();

  const plans = useTenantPlans(open);
  const pending = usePendingInvoices(open);
  const purchase = usePurchaseSubscription();
  const selection = usePlanPurchase(packagePlansForScope(plans.data ?? [], scope));
  const router = useRouter();

  /** Hoá đơn còn chờ ở CÙNG loại xe — tạo hoá đơn mới sẽ huỷ nó (server void hoá đơn `issued` cũ). */
  const pendingSameScope = pendingInvoiceForScope(pending.data ?? [], scope);
  const laneTitle = t(`lanes.title.${scope}`);

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
      title={t('purchase.titleFor', { scope: laneTitle })}
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
        <div className={styles.empty}>{t('purchase.emptyFor', { scope: laneTitle })}</div>
      ) : (
        <>
          {current ? (
            <div className={styles.timingSection}>
              <div className={styles.timingLabel}>{t('purchase.timingLabel')}</div>
              <Radio.Group
                value={selection.timing}
                onChange={(e) => selection.setTiming(e.target.value)}
                className={styles.timingGroup}
              >
                <Radio value={SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM}>
                  <span className={styles.timingOptionText}>
                    <strong>{t('purchase.timingNextTerm')}</strong>
                    <span className={styles.timingOptionDesc}>
                      {t('purchase.chainsAfter', {
                        plan: current.planName,
                        date: fmt.date(current.endsAt),
                      })}
                    </span>
                  </span>
                </Radio>
                <Radio value={SUBSCRIPTION_CHANGE_TIMING.NOW}>
                  <span className={styles.timingOptionText}>
                    <strong>{t('purchase.timingNow')}</strong>
                    <span className={styles.timingOptionDesc}>
                      {t('purchase.timingNowDesc')}
                    </span>
                  </span>
                </Radio>
              </Radio.Group>
              {selection.timing === SUBSCRIPTION_CHANGE_TIMING.NOW ? (
                <Alert
                  type="warning"
                  showIcon
                  className={styles.timingAlert}
                  title={t('purchase.timingNowWarning')}
                />
              ) : null}
            </div>
          ) : (
            <p className={styles.context}>{t('purchase.startsOnPayment')}</p>
          )}

          {pendingSameScope ? (
            <Alert
              type="warning"
              showIcon
              title={t('purchase.replacesPending', { code: pendingSameScope.code })}
            />
          ) : null}

          <PlanPricingTable state={selection} label={laneTitle} />

          {/*
            Đây là lần duy nhất gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy
            định phí dịch vụ với thứ tự hiển thị mà họ đang mua.
          */}
          <LegalConsentNote place="subscription" className={styles.consent} />

          <div className={styles.actions}>
            {/*
              Tổng tiền đứng CẠNH nút tạo hoá đơn: đây là con số người dùng xác nhận khi bấm.
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
              {selection.timing === SUBSCRIPTION_CHANGE_TIMING.NOW
                ? t('purchase.submitNow')
                : t('purchase.submit')}
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
