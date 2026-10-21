'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BILLING_PHASE, type BillingPhase } from '@xeprime/types';

import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { paymentPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';

import { useTenantPlans } from '../hooks/use-subscription';
import {
  PLAN_LANE_SCOPES,
  VEHICLE_QUOTA_KIND,
  currentPlanForScope,
  enterprisePlanOf,
  laneVehicleType,
  pendingInvoiceForScope,
  planLaneElementId,
  quotaForLane,
  type PlanLaneScope,
} from '../plan-lanes';
import { enterpriseTierOf } from '../plan-purchase';
import type { CurrentPlan, MySubscription, SubscriptionInvoice, VehicleTypeQuota } from '../types';
import { EnterprisePlanCard } from './EnterprisePlanCard';
import { TermPill } from './PlanSummaryPanel';
import styles from './PlanLanesPanel.module.css';

/**
 * HAI LÀN GÓI — xe máy và ô tô, mỗi làn một gói riêng (ADR 0065 điều 2), cộng thẻ doanh nghiệp.
 *
 * Mỗi làn trả lời ba câu cho ĐÚNG loại xe của nó: đang có gói gì, tới khi nào; đang dùng bao nhiêu
 * suất; và việc tiếp theo là gì (gia hạn / nâng bậc, mua gói, hay trả nốt hoá đơn đang chờ). Không
 * còn một bảng giá ba bậc chung: một cửa hàng 8 xe máy và một gian hàng 8 ô tô mua hai thứ khác nhau.
 *
 * ## Doanh nghiệp phủ cả hai làn
 *
 * Kỳ `all` đang chạy ⇒ hai làn ĐÓNG: không nút mua nào. Mua gói xe máy lúc đó không bắt đầu ngay mà
 * nối SAU kỳ doanh nghiệp (chồng phạm vi — EXCLUDE ở DB), tức là trả tiền cho một thứ chưa dùng tới
 * — không phải điều ai muốn khi bấm "Mua". Thẻ doanh nghiệp nói nó phủ cả hai loại xe và chỉ lối
 * liên hệ tư vấn.
 *
 * Thiếu `subscription.purchase` (hoặc trong phiên hỗ trợ) ⇒ `onPurchase` vắng mặt và không làn nào
 * có nút mua — chỉ còn thông tin.
 */
export function PlanLanesPanel({
  data,
  pendingInvoices,
  highlightedLane,
  onPurchase,
}: {
  data: MySubscription;
  pendingInvoices: readonly SubscriptionInvoice[];
  /** Làn vừa được trỏ tới từ `?lane=` — viền nổi để mắt tìm ra ngay. */
  highlightedLane: PlanLaneScope | null;
  onPurchase?: (scope: PlanLaneScope) => void;
}) {
  const t = useTranslations('Subscription.lanes');
  const plans = useTenantPlans();
  const enterpriseTier = enterpriseTierOf(plans.data ?? []);

  const enterprise = enterprisePlanOf(data.currentPlans);

  return (
    <section className={styles.panel} aria-labelledby="xp-plan-lanes-title">
      <header className={styles.head}>
        <h3 id="xp-plan-lanes-title" className={styles.title}>
          {t('sectionTitle')}
        </h3>
        <p className={styles.subtitle}>{enterprise ? t('sectionEnterprise') : t('sectionHint')}</p>
      </header>

      {enterprise ? (
        <EnterprisePlanCard active={enterprise} tier={enterpriseTier} />
      ) : (
        <>
          <div className={styles.lanes}>
            {PLAN_LANE_SCOPES.map((scope) => (
              <PlanLaneCard
                key={scope}
                scope={scope}
                current={currentPlanForScope(data.currentPlans, scope)}
                quota={quotaForLane(data.vehicleQuotas, scope)}
                pendingInvoice={pendingInvoiceForScope(pendingInvoices, scope)}
                highlighted={highlightedLane === scope}
                onPurchase={onPurchase ? () => onPurchase(scope) : undefined}
              />
            ))}
          </div>
          {enterpriseTier ? <EnterprisePlanCard tier={enterpriseTier} /> : null}
        </>
      )}
    </section>
  );
}

function PlanLaneCard({
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
  const t = useTranslations('Subscription.lanes');
  const tPayment = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const Icon = VEHICLE_TYPE_ICON[laneVehicleType(scope)];
  const title = t(`title.${scope}`);
  const phase = (current?.phase ?? null) as BillingPhase | null;
  const missing = quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED;

  return (
    <article
      id={planLaneElementId(scope)}
      tabIndex={-1}
      className={cx(styles.lane, highlighted && styles.laneHighlighted)}
      aria-label={title}
    >
      <div className={styles.laneHead}>
        <span className={styles.laneIcon} aria-hidden="true">
          <Icon />
        </span>
        <h4 className={styles.laneTitle}>{title}</h4>
        {current ? (
          <Tag color={phase === BILLING_PHASE.GRACE ? 'warning' : 'gold'} className={styles.tag}>
            {phase === BILLING_PHASE.GRACE ? t('graceTag') : t('activeTag')}
          </Tag>
        ) : (
          <Tag className={styles.tag}>{t('noneTag')}</Tag>
        )}
      </div>

      {current ? (
        <div className={styles.current}>
          <div className={styles.currentText}>
            <p className={styles.planName}>{current.planName}</p>
            <p className={styles.meta}>{t('endsOn', { date: fmt.date(current.endsAt) })}</p>
          </div>
          <TermPill endsAt={current.endsAt} phase={phase} />
        </div>
      ) : (
        <p className={cx(styles.meta, missing && styles.missing)}>
          {missing ? t(`scopeRequired.${scope}`) : t(`noPlanHint.${scope}`)}
        </p>
      )}

      <p className={styles.usage}>
        {quota.kind === VEHICLE_QUOTA_KIND.TOTAL && quota.limit != null
          ? t('usageOf', { used: quota.used, limit: quota.limit })
          : quota.kind === VEHICLE_QUOTA_KIND.UNLIMITED
            ? t('usageUnlimited', { used: quota.used })
            : t('usageNoPlan', { used: quota.used })}
        {quota.onMarketplace > 0 ? (
          <span className={styles.usageSub}>
            {' · '}
            {t('onMarketplace', { count: quota.onMarketplace })}
          </span>
        ) : null}
      </p>

      {pendingInvoice ? (
        <div className={styles.pending}>
          <span>{t('pendingInvoice', { code: pendingInvoice.code })}</span>
          <Link href={paymentPath.invoice(pendingInvoice.id)}>
            <Button size="small" icon={<CreditCardOutlined aria-hidden />}>
              {tPayment('payNow')}
            </Button>
          </Link>
        </div>
      ) : null}

      {onPurchase ? (
        <div className={styles.actions}>
          <Button type={current ? 'default' : 'primary'} onClick={onPurchase}>
            {current ? t('renew') : t(`buy.${scope}`)}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
