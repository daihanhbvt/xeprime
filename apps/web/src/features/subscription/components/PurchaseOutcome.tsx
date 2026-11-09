'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import {
  PLAN_PURCHASE_KIND,
  STATUS_COLOR,
  type PlanPurchaseKind,
  type StatusColor,
} from '@xeprime/types';

import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusPill } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';

import type { SubscriptionPurchasePreviewItem } from '../types';
import styles from './PurchaseOutcome.module.css';

/**
 * Một lượt mua sẽ LÀM GÌ với gói hiện tại - đọc từ bản xem trước của server (ADR 0084), không suy ở
 * client. Dùng chung cho bước xác nhận của hộp mua gói và `PurchaseModal`.
 */
const KIND_COLOR: Record<PlanPurchaseKind, StatusColor> = {
  [PLAN_PURCHASE_KIND.NEW]: STATUS_COLOR.PROCESSING,
  [PLAN_PURCHASE_KIND.RENEW]: STATUS_COLOR.SUCCESS,
  [PLAN_PURCHASE_KIND.UPGRADE]: STATUS_COLOR.WARNING,
  [PLAN_PURCHASE_KIND.CHANGE_NEXT]: STATUS_COLOR.INFO,
};

/** Mua mới / bắt đầu ngay ⇒ ngày bắt đầu là lúc tiền về, không phải lúc xem trước. */
const STARTS_ON_PAYMENT: readonly PlanPurchaseKind[] = [
  PLAN_PURCHASE_KIND.NEW,
  PLAN_PURCHASE_KIND.UPGRADE,
];

export function PurchaseKindTag({ kind }: { kind: PlanPurchaseKind }) {
  const t = useTranslations('Subscription.purchaseOutcome');
  return <StatusPill color={KIND_COLOR[kind]}>{t(`kind.${kind}`)}</StatusPill>;
}

/** "14/01/2027 → 14/04/2027", hoặc "Khi thanh toán xong → … (dự kiến)" cho lượt bắt đầu khi tiền về. */
export function usePurchasePeriodText() {
  const t = useTranslations('Subscription.purchaseOutcome');
  const fmt = useAppFormat();
  return (item: SubscriptionPurchasePreviewItem) =>
    STARTS_ON_PAYMENT.includes(item.kind)
      ? t('periodOnPayment', { to: fmt.date(item.endsAt) })
      : t('periodRange', { from: fmt.date(item.startsAt), to: fmt.date(item.endsAt) });
}

/**
 * Ba câu của một lượt mua: điều sẽ xảy ra, kỳ cũ bị kết thúc sớm (nâng ngay - không bù), và số xe
 * vượt trần mới (hạ bậc). `null` = không áp dụng cho lượt này.
 */
function usePurchaseOutcomeText(
  item: SubscriptionPurchasePreviewItem,
  usedVehicles: number | null,
): { note: string; upgradeWarning: string | null; overCap: string | null } {
  const t = useTranslations('Subscription.purchaseOutcome');
  const fmt = useAppFormat();
  const startDate = fmt.date(item.startsAt);
  const overCap =
    item.kind !== PLAN_PURCHASE_KIND.UPGRADE &&
    item.maxVehicles != null &&
    usedVehicles != null &&
    usedVehicles > item.maxVehicles;

  return {
    note:
      item.kind === PLAN_PURCHASE_KIND.RENEW || item.kind === PLAN_PURCHASE_KIND.CHANGE_NEXT
        ? t(`note.${item.kind}`, { date: startDate })
        : t(`note.${item.kind}`),
    upgradeWarning:
      item.kind === PLAN_PURCHASE_KIND.UPGRADE && item.replacedTerms.length > 0
        ? t('upgradeWarning', {
            terms: item.replacedTerms
              .map((term) =>
                t('replacedTerm', { plan: term.planName, date: fmt.date(term.endsAt) }),
              )
              .join(', '),
          })
        : null,
    overCap: overCap
      ? t('overCap', { date: startDate, cap: item.maxVehicles!, used: usedVehicles! })
      : null,
  };
}

/**
 * Câu nói trước điều sẽ xảy ra + cảnh báo khi có mất mát: nâng ngay làm các kỳ cũ kết thúc (không
 * bù), hạ bậc làm số xe đang có vượt trần mới. Bản ĐẦY ĐỦ - `PurchaseModal`.
 */
export function PurchaseOutcomeNotes({
  item,
  usedVehicles,
}: {
  item: SubscriptionPurchasePreviewItem;
  /** Số xe đang có ở loại xe này - để cảnh báo khi trần mới thấp hơn. */
  usedVehicles: number | null;
}) {
  const text = usePurchaseOutcomeText(item, usedVehicles);

  return (
    <div className={styles.notes}>
      <p className={styles.note}>{text.note}</p>
      {text.upgradeWarning ? <Alert type="warning" showIcon title={text.upgradeWarning} /> : null}
      {text.overCap ? <Alert type="warning" showIcon title={text.overCap} /> : null}
    </div>
  );
}

/**
 * Bản GỌN cho thẻ xác nhận của hộp mua gói (người dùng 09/11/2026: bỏ hộp ghi chú dưới thẻ). Câu
 * "điều sẽ xảy ra" và câu "kỳ cũ kết thúc, không hoàn" vào dấu ⓘ đặt cạnh nhãn lượt mua - nhãn
 * "Nâng cấp ngay" đã nói điều chính, ⓘ nói phần hệ quả cho ai muốn đọc.
 */
export function PurchaseOutcomeHint({ item }: { item: SubscriptionPurchasePreviewItem }) {
  const t = useTranslations('Subscription.purchaseOutcome');
  const text = usePurchaseOutcomeText(item, null);

  return (
    <InfoHint
      label={t('hintLabel')}
      content={
        <>
          {text.note}
          {text.upgradeWarning ? (
            <>
              <br />
              {text.upgradeWarning}
            </>
          ) : null}
        </>
      }
    />
  );
}

/**
 * Hạ bậc mà số xe đang có vượt trần mới - vẫn là một cảnh báo hiện hẳn (hiếm, và nó đổi điều gian
 * hàng làm được ngay sau khi trả tiền). Không có gì để nói thì không dựng gì.
 */
export function PurchaseOverCapAlert({
  item,
  usedVehicles,
}: {
  item: SubscriptionPurchasePreviewItem;
  usedVehicles: number;
}) {
  const { overCap } = usePurchaseOutcomeText(item, usedVehicles);
  return overCap ? <Alert type="warning" showIcon title={overCap} /> : null;
}
