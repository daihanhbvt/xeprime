'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useState } from 'react';
import {
  BILLING_MODE,
  BILLING_PHASE,
  PARTNER_QUOTA_KIND,
  PLAN_EXPIRING_SOON_DAYS,
  STATUS_COLOR,
  daysLeftUntil,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { AdminTenant } from '../types';
import styles from './AdminTenantTable.module.css';

type TenantPlan = AdminTenant['plan'];

/**
 * Ô "Gói hiện tại" của danh sách gian hàng gói — trả lời ba câu trong một liếc: đang dùng gói gì,
 * tới khi nào, kỳ sau là gì.
 *
 * Pha (đang chạy / ân hạn / hết hạn / chưa có gói) do SERVER chấm bằng `resolveEffectiveBilling`;
 * ô này chỉ chọn câu chữ và màu. "Sắp hết hạn" chỉ cảnh báo khi CHƯA có kỳ xếp sau — gian hàng đã
 * gia hạn trước thì không có gì phải gọi.
 */
export function PartnerPlanCell({ plan }: { plan: TenantPlan }) {
  const t = useTranslations('AdminTenants.list.plan');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  // "Bây giờ" chốt một lần cho mỗi lần dựng ô — render lại không làm số ngày nhảy.
  const [now] = useState(() => Date.now());

  if (plan.phase === BILLING_PHASE.UNCONFIGURED || !plan.planName) {
    return <span className={styles.meta}>{t('none')}</span>;
  }

  const onCommission = plan.billingMode === BILLING_MODE.COMMISSION;
  const daysLeft = plan.endsAt ? daysLeftUntil(plan.endsAt, now) : null;
  const expiringSoon =
    plan.phase === BILLING_PHASE.CURRENT &&
    !plan.nextTerm &&
    daysLeft !== null &&
    daysLeft <= PLAN_EXPIRING_SOON_DAYS;

  return (
    <div className={styles.plan}>
      <div className={styles.planHead}>
        <span className={styles.name}>{plan.planName}</span>
        {plan.phase === BILLING_PHASE.GRACE ? (
          <Tag color={STATUS_COLOR.WARNING}>{domainLabel('billingPhase', plan.phase)}</Tag>
        ) : plan.phase === BILLING_PHASE.LAPSED ? (
          <Tag color={STATUS_COLOR.DANGER}>{domainLabel('billingPhase', plan.phase)}</Tag>
        ) : onCommission ? (
          <Tag>{domainLabel('billingMode', plan.billingMode)}</Tag>
        ) : null}
      </div>

      {plan.endsAt && !onCommission ? (
        <div className={styles.meta}>
          {plan.phase === BILLING_PHASE.CURRENT
            ? t('endsOn', { date: fmt.date(plan.endsAt) })
            : t('endedOn', { date: fmt.date(plan.endsAt) })}
          {plan.phase === BILLING_PHASE.CURRENT && daysLeft !== null ? (
            <span className={expiringSoon ? styles.warn : undefined}>
              {LIST_SEPARATOR}
              {t('daysLeft', { days: daysLeft })}
            </span>
          ) : null}
          {plan.phase === BILLING_PHASE.GRACE && plan.graceEndsAt ? (
            <span className={styles.warn}>
              {LIST_SEPARATOR}
              {t('graceUntil', { date: fmt.date(plan.graceEndsAt) })}
            </span>
          ) : null}
        </div>
      ) : null}

      {plan.nextTerm ? (
        <div className={styles.next}>
          {t('next', { plan: plan.nextTerm.planName, date: fmt.date(plan.nextTerm.startsAt) })}
        </div>
      ) : null}
    </div>
  );
}

/** "1 / 3" khi kỳ gói có trần xe, "1 / ∞" khi không giới hạn, chỉ số xe khi không áp dụng. */
export function VehicleCountCell({ count, plan }: { count: number; plan: TenantPlan }) {
  const t = useTranslations('AdminTenants.list.plan');
  if (plan.vehicleLimitKind === PARTNER_QUOTA_KIND.TOTAL && plan.vehicleLimit != null) {
    return (
      <span className={count >= plan.vehicleLimit ? styles.warn : undefined}>
        {count}
        <span className={styles.meta}> / {plan.vehicleLimit}</span>
      </span>
    );
  }
  if (plan.vehicleLimitKind === PARTNER_QUOTA_KIND.UNLIMITED) {
    return (
      <span>
        {count}
        <span className={styles.meta} title={t('unlimited')}>
          {' '}
          / ∞
        </span>
      </span>
    );
  }
  return <span>{count}</span>;
}
