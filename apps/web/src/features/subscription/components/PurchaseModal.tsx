'use client';

import { Alert, App, Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
  usePurchasePreview,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import type { CurrentPlan } from '../types';
import {
  EMPTY_PLAN_SLOT_CHOICE,
  PlanSlotSelection,
  planSlotChoiceReady,
  planSlotSelectionBody,
  type PlanSlotChoice,
} from './PlanSlotSelection';
import { PurchaseKindTag, PurchaseOutcomeNotes, usePurchasePeriodText } from './PurchaseOutcome';
import styles from './PurchaseModal.module.css';

/**
 * Mua / gia hạn gói cho MỘT loại xe (ADR 0065): chọn BẬC (1 / 5 / 10 xe) + KỲ HẠN → sinh HOÁ ĐƠN
 * kèm mã đối soát. Gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4), nên hoá đơn tạo xong là modal
 * đóng và người dùng sang thẳng TRANG THANH TOÁN của hoá đơn đó (`/payment/:invoiceId`).
 *
 * Kỳ mới bắt đầu lúc nào là việc của SERVER (ADR 0084): cùng bậc = gia hạn nối tiếp, trần cao hơn =
 * nâng ngay, còn lại = nối tiếp - người mua không chọn. Modal đọc bản xem trước của server cho bậc
 * đang chọn (`usePurchasePreview`) để NÓI trước điều đó; kỳ thật in trên hoá đơn (`periodFrom`).
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
  /** Kỳ đang chạy CÙNG loại xe - để nói trước kỳ mới nối tiếp lúc nào. */
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
  const preview = usePurchasePreview(
    selection.selection ? [selection.selection.body] : [],
    open && Boolean(selection.selection),
  );
  const outcome = selection.selection ? preview.data?.items[0] : undefined;
  /*
   * Xe giữ lại khi lượt mua vượt suất (ADR 0085 điều 5) — chỉ đọc bản xem trước KHỚP bậc/kỳ đang chọn
   * (`placeholderData` còn giữ bản cũ lúc vừa đổi lựa chọn). Chưa có bản khớp thì chưa cho tạo hoá đơn.
   */
  const previewReady = Boolean(selection.selection) && preview.isSuccess && !preview.isPlaceholderData;
  const [slotChoice, setSlotChoice] = useState<PlanSlotChoice>(EMPTY_PLAN_SLOT_CHOICE);
  const slotGroups = previewReady ? preview.data!.vehicleSlots : undefined;
  const slotsReady = previewReady && planSlotChoiceReady(slotGroups, slotChoice);
  const periodText = usePurchasePeriodText();
  const router = useRouter();

  /** Hoá đơn còn chờ ở CÙNG loại xe - tạo hoá đơn mới sẽ huỷ nó (server void hoá đơn `issued` cũ). */
  const pendingSameScope = pendingInvoiceForScope(pending.data ?? [], scope);
  const laneTitle = t(`lanes.title.${scope}`);

  function submit() {
    // Enter vẫn gửi form khi nút đang quay - không tạo hoá đơn thứ hai trong lúc lượt đầu đang bay.
    if (!selection.selection || purchase.isPending || !slotsReady) return;
    purchase.mutate({ ...selection.selection.body, ...planSlotSelectionBody(slotGroups, slotChoice) }, {
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
     * không có lần remount nào dọn hộ. Thiếu dòng này thì mở lại thấy một kỳ hạn đã sáng - và
     * ngay sau một lượt mua thành công, đó là một cú bấm tới hoá đơn thứ hai.
     */
    selection.reset();
    setSlotChoice(EMPTY_PLAN_SLOT_CHOICE);
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
          {/*
            Lượt mua này làm gì với gói hiện tại - từ bản xem trước của server, không phải một lựa
            chọn của người mua (ADR 0084). Chưa chọn bậc thì nói luật chung.
          */}
          {outcome ? (
            <div className={styles.outcome} aria-live="polite">
              <div className={styles.outcomeHead}>
                <PurchaseKindTag kind={outcome.kind} />
                <span className={styles.outcomePeriod}>{periodText(outcome)}</span>
              </div>
              <PurchaseOutcomeNotes item={outcome} usedVehicles={null} />
            </div>
          ) : (
            <p className={styles.context}>
              {current
                ? t('purchase.currentPlanRule', {
                    plan: current.planName,
                    date: fmt.date(current.endsAt),
                  })
                : t('purchase.startsOnPayment')}
            </p>
          )}

          {pendingSameScope ? (
            <Alert
              type="warning"
              showIcon
              title={t('purchase.replacesPending', { code: pendingSameScope.code })}
            />
          ) : null}

          <PlanPricingTable state={selection} label={laneTitle} />

          {slotGroups ? (
            <PlanSlotSelection groups={slotGroups} value={slotChoice} onChange={setSlotChoice} />
          ) : null}

          {/*
            Đây là lần duy nhất gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy
            định phí dịch vụ với thứ tự hiển thị mà họ đang mua.
          */}
          <LegalConsentNote place="packagePurchase" className={styles.consent} />

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
              disabled={!slotsReady}
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
