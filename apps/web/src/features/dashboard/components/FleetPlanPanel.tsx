'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button, Progress, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { BILLING_PHASE, PERMISSION, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { InfoCard } from '@/components/layout/InfoCard';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import type { useFleetSummary } from '@/features/vehicles/hooks/use-fleet-summary';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { PLAN_RENEW_WARNING_DAYS, daysUntil } from '../dashboard-model';
import type { DashboardLinks } from '../hooks/use-dashboard-links';
import type { PartnerOverviewMarket } from '../types';
import { HeadLink } from './HeadLink';
import styles from './FleetPlanPanel.module.css';

type FleetQuery = ReturnType<typeof useFleetSummary>;

/**
 * "Đội xe & gói dịch vụ" — Figma `24138:80604`: dải gói tối (tên gói · hết hạn · "Còn N ngày"),
 * thanh trạng thái xe trên chợ + chú giải bốn trạng thái, link "Quản lý xe".
 *
 * Gộp ba khối cũ (Gói · Xe trên chợ · thẻ "Xe sẵn sàng" — chốt 17/11/2026). Phần nào người xem
 * không được thấy thì vắng: gói cần `subscriptions.view` và tuyến gói; chợ cần `vehicles.view` và
 * tuyến gói; "Xe sẵn sàng" cần `vehicles.view` (cả hai tuyến). Không còn phần nào ⇒ không dựng thẻ.
 * Cùng logic với `FleetPlanPanel` của app Partner (app ẩn phần gói theo chính sách store).
 */
export function FleetPlanPanel({
  showPlan,
  showMarket,
  market,
  fleet,
  links,
}: {
  showPlan: boolean;
  showMarket: boolean;
  market: PartnerOverviewMarket | undefined;
  /** `null` = người xem không có `vehicles.view`. */
  fleet: FleetQuery | null;
  links: DashboardLinks;
}) {
  const tFleet = useTranslations('Dashboard.fleetPlan');
  const tPlan = useTranslations('Dashboard.plan');
  const tMarket = useTranslations('Dashboard.market');
  if (!showPlan && !showMarket && !fleet) return null;

  const title = showPlan
    ? showMarket || fleet
      ? tFleet('title')
      : tPlan('title')
    : tFleet('fleetTitle');

  return (
    <InfoCard
      title={title}
      {...(fleet || showMarket
        ? { extra: <HeadLink href={links.vehicles} label={tMarket('manage')} /> }
        : {})}
    >
      {showPlan ? <PlanSection href={links.subscription} /> : null}
      {fleet ? <AvailableRow fleet={fleet} href={links.availableVehicles} /> : null}
      {showMarket ? <MarketSection market={market} links={links} /> : null}
    </InfoCard>
  );
}

function PlanSection({ href }: { href: string }) {
  const t = useTranslations('Dashboard.plan');
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  const { data, isPending, isError } = useMySubscription();

  if (isPending) return <Skeleton active title={false} paragraph={{ rows: 2 }} />;
  if (isError || !data) return <p className={styles.note}>{t('loadError')}</p>;
  const plan = data.currentPlan ?? null;
  if (!plan) return <p className={styles.note}>{t('none')}</p>;

  const quota = data.fleetQuota;
  const inGrace = user?.tenant?.billingPhase === BILLING_PHASE.GRACE;
  const daysLeft = daysUntil(plan.endsAt, dayjs());
  const expiring = inGrace || daysLeft <= PLAN_RENEW_WARNING_DAYS;
  const limit = quota?.kind === 'total' ? quota.totalLimit : null;
  const used = quota?.totalUsed ?? 0;
  const atCapacity = limit !== null && used >= limit;
  const graceEndsAt = user?.tenant?.graceEndsAt;
  const sub =
    inGrace && graceEndsAt
      ? t('grace', { date: fmt.date(graceEndsAt) })
      : t('endsAt', { date: fmt.date(plan.endsAt) });

  return (
    <div className={styles.planBlock}>
      <Link href={href} className={styles.plan}>
        <span className={styles.planIcon} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/partner/dashboard/plan-icon.svg" alt="" width={24} height={24} />
        </span>
        <span className={styles.planText}>
          <span className={styles.planName}>{plan.planName}</span>
          <span className={cx(styles.planSub, expiring && styles.planSubWarn)}>{sub}</span>
        </span>
        {inGrace ? null : (
          <span className={cx(styles.planChip, expiring && styles.planChipWarn)}>
            {t('daysLeft', { count: Math.max(0, daysLeft) })}
          </span>
        )}
      </Link>
      <div className={styles.quota}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('vehicles')}</span>
          <span className={styles.rowValue}>
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
            strokeColor={atCapacity ? undefined : 'var(--xp-color-primary)'}
          />
        ) : null}
        {atCapacity ? <p className={styles.noteWarn}>{t('atCapacity')}</p> : null}
      </div>
      {expiring && has(PERMISSION.SUBSCRIPTION_PURCHASE) ? (
        <div className={styles.actions}>
          <Button type="primary" onClick={() => router.push(href)}>
            {t('renew')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AvailableRow({ fleet, href }: { fleet: FleetQuery; href: string }) {
  const t = useTranslations('Dashboard');
  // Lỗi đếm đội xe nói "Không rõ", không giả vờ 0/0 - cùng app Partner.
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const data = fleet.data;
  return (
    <Link href={href} className={styles.available}>
      <span className={styles.row}>
        <span className={styles.rowLabel}>{t('fleetPlan.available')}</span>
        <span className={styles.rowValue}>
          {fleet.isPending
            ? '…'
            : data
              ? `${fmt.count(data.available)}/${fmt.count(data.total)}`
              : tCommon('emptyValue')}
        </span>
      </span>
      {data ? (
        <span className={styles.rowHint}>
          {t('kpi.fleetHint', {
            renting: fmt.count(data.renting),
            maintenance: fmt.count(data.maintenance),
          })}
        </span>
      ) : null}
    </Link>
  );
}

type MarketKey = 'onMarket' | 'inReview' | 'draft' | 'needsRevision';

function MarketSection({
  market,
  links,
}: {
  market: PartnerOverviewMarket | undefined;
  links: DashboardLinks;
}) {
  const t = useTranslations('Dashboard.market');
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  if (!market) return <Skeleton active title={false} paragraph={{ rows: 2 }} />;

  // Thứ tự + màu như thanh của bản vẽ và app Partner: trên chợ · chờ duyệt · chưa gửi · cần sửa.
  const rows: { key: MarketKey; count: number; href: string }[] = [
    { key: 'onMarket', count: market.onMarket, href: links.vehicles },
    {
      key: 'inReview',
      count: market.inReview,
      href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW),
    },
    {
      key: 'draft',
      count: market.draft,
      href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.DRAFT),
    },
    {
      key: 'needsRevision',
      count: market.needsRevision,
      href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION),
    },
  ];
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  if (total === 0) {
    return (
      <div className={styles.emptyMarket}>
        <p className={styles.note}>{t('empty')}</p>
        {has(PERMISSION.VEHICLE_CREATE) ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push(links.vehicleNew)}
          >
            {t('add')}
          </Button>
        ) : null}
      </div>
    );
  }

  // Cột trái: trên chợ + chưa gửi; cột phải: chờ duyệt + cần sửa (đúng bố cục chú giải của bản vẽ).
  const legend: MarketKey[][] = [
    ['onMarket', 'draft'],
    ['inReview', 'needsRevision'],
  ];
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (
    <div className={styles.market}>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('statusTitle')}</span>
        <span className={styles.rowValue}>{t('totalValue', { count: total })}</span>
      </div>
      <div
        className={styles.bar}
        role="img"
        aria-label={rows.map((r) => `${t(r.key)}: ${fmt.count(r.count)}`).join(', ')}
      >
        {rows
          .filter((r) => r.count > 0)
          .map((r) => (
            <span
              key={r.key}
              className={cx(styles.segment, styles[`seg_${r.key}`])}
              style={{ '--grow': r.count } as CSSProperties}
            />
          ))}
      </div>
      <div className={styles.legend}>
        {legend.map((column) => (
          <div key={column.join('-')} className={styles.legendCol}>
            {column.map((key) => {
              const r = byKey.get(key)!;
              return (
                <Link key={key} href={r.href} className={styles.legendItem}>
                  <span className={cx(styles.dot, styles[`seg_${key}`])} aria-hidden="true" />
                  {t('legendLabel', { label: t(key) })}
                  <strong
                    className={cx(
                      styles.legendCount,
                      key === 'draft' && r.count > 0 && styles.countWarn,
                      key === 'needsRevision' && r.count > 0 && styles.countDanger,
                    )}
                  >
                    {fmt.count(r.count)}
                  </strong>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
