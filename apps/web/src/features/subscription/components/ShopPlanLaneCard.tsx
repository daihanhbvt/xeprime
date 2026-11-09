'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { BILLING_PHASE, type BillingPhase } from '@xeprime/types';

import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { invoicePaymentHref } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { nowInAppTz, toAppTz } from '@/lib/datetime';
import { cx } from '@/lib/cx';

import {
  VEHICLE_QUOTA_KIND,
  laneVehicleType,
  planLaneElementId,
  quotaIsFull,
  type PlanLaneScope,
} from '../plan-lanes';
import type { CurrentPlan, SubscriptionInvoice, VehicleTypeQuota } from '../types';
import styles from './ShopPlanSection.module.css';

/** Số ngày còn lại của một kỳ — đồng hồ máy khách, chỉ để ĐỌC (quyền dùng đọc `phase` của server). */
export function daysLeftOf(endsAt: string): number {
  return Math.max(0, toAppTz(endsAt).diff(nowInAppTz(), 'day'));
}

/**
 * Thẻ MỘT loại xe trong "Gói & hạn mức" — design `23999:111394`: gói đang dùng + hạn, số xe đã kích
 * hoạt / trần kèm thanh tiến độ, câu tình trạng suất và một lối mua (Gia hạn · Nâng cấp ngay · Mua gói).
 *
 * Hoá đơn đang chờ tiền của loại xe này hiện ngay trong thẻ (design không vẽ — giữ từ bản cũ): nó
 * là việc dang dở có tiền thật đi kèm, và lối "Thanh toán" dẫn về đúng phiếu (gộp hay đơn lẻ).
 */
export function ShopPlanLaneCard({
  scope,
  current,
  quota,
  pendingInvoice,
  highlighted,
  onPurchase,
}: {
  scope: PlanLaneScope;
  current: CurrentPlan | null;
  quota: VehicleTypeQuota;
  pendingInvoice: SubscriptionInvoice | null;
  highlighted: boolean;
  onPurchase?: () => void;
}) {
  const t = useTranslations('Subscription.shopPlan');
  const tLanes = useTranslations('Subscription.lanes');
  const tTerm = useTranslations('Subscription.term');
  const tCombined = useTranslations('Subscription.combined');
  const tPayment = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const Icon = VEHICLE_TYPE_ICON[laneVehicleType(scope)];
  const phase = (current?.phase ?? null) as BillingPhase | null;
  const scopeLabel = tCombined(`scope.${scope}`);

  const limited = quota.kind === VEHICLE_QUOTA_KIND.TOTAL && quota.limit != null;
  const full = quotaIsFull(quota);
  const free = limited ? Math.max(0, (quota.limit ?? 0) - quota.used) : null;
  const percent = limited && quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  const action = !onPurchase ? null : full ? t('upgradeNow') : current ? t('renew') : t('buy');

  return (
    <article
      id={planLaneElementId(scope)}
      tabIndex={-1}
      className={cx(styles.lane, highlighted && styles.laneHighlighted)}
      aria-label={tLanes(`title.${scope}`)}
    >
      <div className={styles.laneHead}>
        <span className={styles.laneIcon} aria-hidden="true">
          <Icon />
        </span>
        <div className={styles.laneText}>
          <h3 className={styles.laneTitle}>
            {/* Tên bậc của admin đã mang loại xe ("Ô tô · 5 xe") — không ghép thêm lần nữa. */}
            {current ? current.planName : scopeLabel}
          </h3>
          <p className={styles.laneMeta}>
            {current
              ? tLanes('endsOn', { date: fmt.date(current.endsAt) })
              : quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED
                ? tLanes(`scopeRequired.${scope}`)
                : tLanes(`noPlanHint.${scope}`)}
          </p>
        </div>
        {current ? (
          <span
            className={cx(
              styles.badge,
              (phase === BILLING_PHASE.GRACE || phase === BILLING_PHASE.LAPSED) && styles.badgeWarn,
            )}
          >
            {phase === BILLING_PHASE.GRACE
              ? tTerm('grace')
              : phase === BILLING_PHASE.LAPSED
                ? tTerm('lapsed')
                : tTerm('daysLeft', { days: daysLeftOf(current.endsAt) })}
          </span>
        ) : null}
      </div>

      <div className={styles.usage}>
        <p className={styles.usageText}>
          <span className={styles.usageUsed}>{quota.used}</span>
          {limited ? <span className={styles.usageLimit}> / {quota.limit}</span> : null}{' '}
          <span className={styles.usageUnit}>
            {limited || quota.kind !== VEHICLE_QUOTA_KIND.UNLIMITED
              ? t('activated')
              : t('activatedUnlimited')}
          </span>
        </p>
        {limited ? (
          <div
            className={cx(styles.progress, full && styles.progressFull)}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={quota.limit ?? 0}
            aria-valuenow={quota.used}
            aria-label={t('progressLabel', { scope: scopeLabel })}
            // Bề rộng thanh chỉ biết lúc chạy — ngoại lệ CSS custom property của CLAUDE.md §5.
            style={{ '--xp-plan-progress': `${percent}%` } as CSSProperties}
          >
            <span className={styles.progressBar} />
          </div>
        ) : null}
      </div>

      <div className={styles.laneFoot}>
        <p className={cx(styles.availability, full && styles.availabilityFull)}>
          {full
            ? t('full', { scope: scopeLabel.toLowerCase() })
            : free != null
              ? t('free', {
                  free,
                  market:
                    quota.onMarketplace > 0
                      ? tLanes('onMarketplace', { count: quota.onMarketplace })
                      : t('noneOnMarket'),
                })
              : quota.onMarketplace > 0
                ? tLanes('onMarketplace', { count: quota.onMarketplace })
                : t('noneOnMarket')}
        </p>
        {action ? (
          <button type="button" className={styles.linkButton} onClick={onPurchase}>
            {action}
          </button>
        ) : null}
      </div>

      {pendingInvoice ? (
        <div className={styles.pending}>
          <span>
            {tLanes('pendingInvoice', { code: pendingInvoice.checkoutCode ?? pendingInvoice.code })}
          </span>
          <Link
            href={invoicePaymentHref(pendingInvoice, { inShop: true })}
            className={styles.payLink}
          >
            <CreditCardOutlined aria-hidden /> {tPayment('payNow')}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
