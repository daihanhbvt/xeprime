'use client';

import { CrownOutlined } from '@ant-design/icons';
import { Button, Progress, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BILLING_PHASE, PERMISSION } from '@xeprime/types';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { PLAN_RENEW_WARNING_DAYS, daysUntil } from '../dashboard-model';
import { DashboardPanel } from './DashboardPanel';
import styles from './SidePanels.module.css';

/**
 * "Gói dịch vụ" của gian hàng tuyến gói — hạn gói và trần xe, hai thứ quyết định ngày mai còn bán
 * được hay không.
 *
 * Trần xe đọc `fleetQuota` của `GET /subscription` — con số SERVER đã giải từ thuê bao (ADR 0041
 * điều 3), không tự tính từ `limits_json`. Pha ân hạn đọc từ phiên (`billingPhase`), cùng nguồn với
 * băng "hết hạn" của khung trang.
 *
 * Chỉ dựng cho người có `subscription.view` (nơi gọi quyết); nút gia hạn chỉ cho người mua được gói.
 */
export function PlanPanel({ href }: { href: string }) {
  const t = useTranslations('Dashboard.plan');
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  const { data, isLoading, isError } = useMySubscription();

  const plan = data?.currentPlan ?? null;
  const quota = data?.fleetQuota;
  const inGrace = user?.tenant?.billingPhase === BILLING_PHASE.GRACE;
  const daysLeft = plan ? daysUntil(plan.endsAt, dayjs()) : null;
  const expiring = inGrace || (daysLeft !== null && daysLeft <= PLAN_RENEW_WARNING_DAYS);
  const canRenew = has(PERMISSION.SUBSCRIPTION_PURCHASE);

  const limit = quota?.kind === 'total' ? quota.totalLimit : null;
  const used = quota?.totalUsed ?? 0;
  const atCapacity = limit !== null && used >= limit;

  let body;
  if (isLoading) {
    body = <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  } else if (isError || !data) {
    body = <p className={styles.note}>{t('loadError')}</p>;
  } else if (!plan) {
    body = <p className={styles.note}>{t('none')}</p>;
  } else {
    body = (
      <div className={styles.stack}>
        <div className={styles.planHead}>
          <span className={styles.planName}>{plan.planName}</span>
          <span className={cx(styles.planDue, expiring && styles.planDueWarn)}>
            {inGrace && user?.tenant?.graceEndsAt
              ? t('grace', { date: fmt.date(user.tenant.graceEndsAt) })
              : `${t('daysLeft', { count: Math.max(0, daysLeft ?? 0) })} · ${t('endsAt', {
                  date: fmt.date(plan.endsAt),
                })}`}
          </span>
        </div>

        <div>
          <div className={styles.quotaHead}>
            <span>{t('vehicles')}</span>
            <span className={styles.quotaValue}>
              {limit === null
                ? t('vehiclesUnlimited', { used })
                : t('vehiclesValue', { used, limit })}
            </span>
          </div>
          {limit !== null ? (
            <Progress
              percent={limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100}
              showInfo={false}
              size="small"
              status={atCapacity ? 'exception' : 'normal'}
            />
          ) : null}
          {atCapacity ? <p className={styles.noteWarn}>{t('atCapacity')}</p> : null}
        </div>

        <div className={styles.actions}>
          {expiring && canRenew ? (
            <Button type="primary" onClick={() => router.push(href)}>
              {t('renew')}
            </Button>
          ) : (
            <Link href={href} className={styles.extraLink}>
              {t('open')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <DashboardPanel title={t('title')} icon={<CrownOutlined />}>
      {body}
    </DashboardPanel>
  );
}
