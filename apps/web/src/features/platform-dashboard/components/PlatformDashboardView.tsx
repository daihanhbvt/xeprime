'use client';

import {
  CarOutlined,
  DollarOutlined,
  FileTextOutlined,
  PieChartOutlined,
  ShopOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BOOKING_DATE_FIELD,
  PERMISSION,
  PLATFORM_DASHBOARD_TREND_DAYS,
  TENANT_STATUS_META,
  TENANT_STATUS_VALUES,
  type TenantStatus,
} from '@xeprime/types';
import { countChangePercent, moneyChangePercent } from '@xeprime/domain';
import { MoneyVolumeChart } from '@/components/chart/MoneyVolumeChart';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES, adminPartnerPath } from '@/constants/routes';
import { TripOpsDashboardPanel } from '@/features/admin-trips/components/TripOpsDashboardPanel';
import { ChangeBadge } from '@/features/dashboard/components/ChangeBadge';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { todayLabel } from '@/features/dashboard/dashboard-model';
import { FINANCE_QUEUE, financeQueueHref } from '@/features/platform-money/finance-queues';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { buildPeriodRange, dayjs } from '@/lib/datetime';
import { usePlatformOverview } from '../hooks/use-platform-overview';
import { usePlatformQueues } from '../hooks/use-platform-queues';
import type { PlatformRecentTenant } from '../types';
import { PartnerFunnel } from './PartnerFunnel';
import { PlatformWorkQueues, usePlatformQueueTiles } from './PlatformWorkQueues';
import styles from './PlatformDashboardView.module.css';

/** Dấu ngăn các vế của câu trả lời đầu trang. */
const PART_SEPARATOR = ' · ';

/**
 * TỔNG QUAN NỀN TẢNG (`admin.xeprime.vn`) — cùng khuôn với Tổng quan partner (UX §1.5):
 *
 *  1. Câu trả lời + các ô HÀNG ĐỢI người trực được phép xử lý (xe chờ duyệt, bằng lái, tiền vào
 *     chưa khớp, lệnh rút, hoàn tiền, khiếu nại) — mỗi ô gác bằng đúng quyền của màn nó dẫn tới;
 *  2. KPI tháng này so CÙNG KỲ tháng trước: GMV, đơn mới, doanh thu nền tảng (chỉ quyền tiền),
 *     khách mới, đối tác mới, xe trên chợ;
 *  3. Xu hướng GMV 30 ngày + phễu kích hoạt đối tác; cột phải là vận hành chuyến, đối tác mới và
 *     cơ cấu đối tác theo trạng thái.
 *
 * Mỗi khối có trạng thái tải/lỗi của riêng nó — một endpoint hỏng không làm trắng cả màn.
 */
export function PlatformDashboardView() {
  const t = useTranslations('PlatformDashboard');
  const tKpi = useTranslations('PlatformDashboard.kpi');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { has } = usePermissions();

  const queues = usePlatformQueues();
  const tiles = usePlatformQueueTiles(queues);
  const overview = usePlatformOverview();
  const summary = queues.summary;
  const data = overview.data;

  // Câu trả lời: chỉ khi MỌI ô đã có số (không đoán khi còn ô đang tải hoặc lỗi).
  const settled = tiles.length > 0 && tiles.every((tile) => typeof tile.count === 'number');
  const busy = tiles.filter((tile) => (tile.count ?? 0) > 0);
  const answer = settled
    ? busy.length === 0
      ? { text: t('answer.calm'), busy: false }
      : {
          text: t('answer.busy', {
            parts: busy
              .map((tile) => t(`queues.${tile.key}.part`, { count: tile.count ?? 0 }))
              .join(PART_SEPARATOR),
          }),
          busy: true,
        }
    : null;

  const month = buildPeriodRange('this_month');
  const bookingsHref = `${ROUTES.ADMIN.BOOKINGS}?${new URLSearchParams({
    dateField: BOOKING_DATE_FIELD.CREATED_AT,
    dateFrom: month.from,
    dateTo: month.to,
  }).toString()}`;

  const loadingOverview = overview.isLoading;
  const overviewFailed = overview.isError && !data;
  const kpiValue = (render: () => string): string =>
    overviewFailed ? tCommon('states.error') : data ? render() : '—';

  const activity = data?.activity ?? null;
  const revenue = data?.revenue ?? null;
  const seriesEmpty = activity !== null && activity.series.every((d) => d.bookings === 0);

  return (
    <div className={styles.wrap}>
      <DashboardHeader
        title={t('title')}
        subtitle={`${todayLabel(fmt, dayjs())} · ${t('subtitle')}`}
        answer={answer}
      />

      <PlatformWorkQueues tiles={tiles} />

      <section className={styles.kpiSection} aria-label={tKpi('title')}>
        <h2 className={styles.sectionHeading}>{tKpi('title')}</h2>
        <div className={styles.kpis}>
          {/* GMV + đơn: chỉ khi server trả khối `activity` (cần quyền xem đơn). */}
          {data === undefined || activity !== null ? (
            <>
              <StatCard
                label={tKpi('gmv')}
                value={kpiValue(() => fmt.money(activity!.gmv.current))}
                hint={tKpi('gmvHint')}
                icon={DollarOutlined}
                tone="gold"
                loading={loadingOverview}
                href={bookingsHref}
                change={
                  activity ? (
                    <ChangeBadge value={moneyChangePercent(activity.gmv.current, activity.gmv.previous)} />
                  ) : null
                }
              />
              <StatCard
                label={tKpi('bookings')}
                value={kpiValue(() => fmt.count(activity!.bookings.current))}
                hint={activity ? tKpi('bookingsHint', { count: activity.cancelled.current }) : undefined}
                icon={FileTextOutlined}
                tone="blue"
                loading={loadingOverview}
                href={bookingsHref}
                change={
                  activity ? (
                    <ChangeBadge
                      value={countChangePercent(activity.bookings.current, activity.bookings.previous)}
                    />
                  ) : null
                }
              />
            </>
          ) : null}
          {revenue !== null && data !== undefined ? (
            <StatCard
              label={tKpi('revenue')}
              value={fmt.money(revenue.total.current)}
              hint={tKpi('revenueHint', {
                fee: fmt.moneyCompact(revenue.serviceFee.current),
                subs: fmt.moneyCompact(revenue.subscriptions.current),
              })}
              icon={PieChartOutlined}
              tone="green"
              href={financeQueueHref(FINANCE_QUEUE.LEDGER)}
              change={
                <ChangeBadge value={moneyChangePercent(revenue.total.current, revenue.total.previous)} />
              }
            />
          ) : null}
          <StatCard
            label={tKpi('customers')}
            value={kpiValue(() => fmt.count(data!.growth.newCustomers.current))}
            icon={UserAddOutlined}
            tone="blue"
            loading={loadingOverview}
            href={has(PERMISSION.PLATFORM_CUSTOMER_VIEW) ? ROUTES.ADMIN.CUSTOMERS : undefined}
            change={
              data ? (
                <ChangeBadge
                  value={countChangePercent(
                    data.growth.newCustomers.current,
                    data.growth.newCustomers.previous,
                  )}
                />
              ) : null
            }
          />
          <StatCard
            label={tKpi('partners')}
            value={kpiValue(() => fmt.count(data!.growth.newPartners.current))}
            icon={ShopOutlined}
            tone="gold"
            loading={loadingOverview}
            href={has(PERMISSION.PLATFORM_TENANT_VIEW) ? ROUTES.ADMIN.PARTNER_SHOPS : undefined}
            change={
              data ? (
                <ChangeBadge
                  value={countChangePercent(
                    data.growth.newPartners.current,
                    data.growth.newPartners.previous,
                  )}
                />
              ) : null
            }
          />
          <StatCard
            label={tKpi('listings')}
            value={
              summary.data
                ? fmt.count(summary.data.listingActive)
                : summary.isError
                  ? tCommon('states.error')
                  : '—'
            }
            hint={summary.data ? tKpi('listingsHint', { total: summary.data.listingTotal }) : undefined}
            icon={CarOutlined}
            tone="green"
            loading={summary.isLoading}
            href={has(PERMISSION.PLATFORM_VEHICLE_VIEW) ? ROUTES.ADMIN.VEHICLES : undefined}
          />
        </div>
      </section>

      <div className={styles.columns}>
        <div className={styles.main}>
          {data === undefined || activity !== null ? (
            <MoneyVolumeChart
              points={(activity?.series ?? []).map((day) => ({
                key: day.date,
                money: day.gmv,
                count: day.bookings,
              }))}
              labelOf={(date) => fmt.dateKey(date)}
              moneyLabel={t('trend.gmv')}
              countLabel={t('trend.bookings')}
              title={t('trend.title', { days: PLATFORM_DASHBOARD_TREND_DAYS })}
              description={t('trend.description')}
              loading={loadingOverview}
              error={
                overviewFailed
                  ? { title: t('trend.error'), onRetry: () => void overview.refetch() }
                  : null
              }
              empty={seriesEmpty ? { title: t('trend.empty', { days: PLATFORM_DASHBOARD_TREND_DAYS }) } : null}
            />
          ) : null}
          <PartnerFunnel funnel={data?.funnel} />
        </div>

        <aside className={styles.side}>
          {/* Vận hành chuyến đọc `/platform/trips/summary` — gác bằng quyền đơn thuê như chính màn đó. */}
          {has(PERMISSION.PLATFORM_BOOKING_VIEW) ? <TripOpsDashboardPanel /> : null}
          <RecentPartnersPanel tenants={summary.data?.recentTenants} loading={summary.isLoading} />
          <PartnerStatusPanel byStatus={summary.data?.tenantsByStatus} total={summary.data?.tenantTotal} />
        </aside>
      </div>
    </div>
  );
}

function RecentPartnersPanel({
  tenants,
  loading,
}: {
  tenants: PlatformRecentTenant[] | undefined;
  loading: boolean;
}) {
  const t = useTranslations('PlatformDashboard.recent');
  const fmt = useAppFormat();
  return (
    <DashboardPanel
      title={t('title')}
      icon={<TeamOutlined />}
      extra={
        <Link href={ROUTES.ADMIN.PARTNER_SHOPS} className={styles.extraLink}>
          {t('manage')}
        </Link>
      }
    >
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
      ) : !tenants || tenants.length === 0 ? (
        <p className={styles.muted}>{t('empty')}</p>
      ) : (
        <ul className={styles.miniList}>
          {tenants.map((tenant) => (
            <li key={tenant.id} className={styles.miniRow}>
              <Link href={adminPartnerPath.resolveTenant(tenant.id)} className={styles.miniLink}>
                <span className={styles.miniText}>
                  <span className={styles.miniName}>{tenant.name}</span>
                  <span className={styles.miniMeta}>
                    {tenant.provinceName ? `${tenant.provinceName} · ` : ''}
                    {fmt.date(tenant.createdAt)}
                  </span>
                </span>
                <StatusTag value={tenant.status as TenantStatus} meta={TENANT_STATUS_META} group="tenantStatus" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

/** Cơ cấu đối tác theo trạng thái — chỉ những trạng thái có ít nhất một đối tác. */
function PartnerStatusPanel({
  byStatus,
  total,
}: {
  byStatus: Record<TenantStatus, number> | undefined;
  total: number | undefined;
}) {
  const t = useTranslations('PlatformDashboard.mix');
  const fmt = useAppFormat();
  const rows = byStatus ? TENANT_STATUS_VALUES.filter((status) => (byStatus[status] ?? 0) > 0) : [];
  return (
    <DashboardPanel
      title={t('title')}
      icon={<ShopOutlined />}
      extra={total !== undefined ? <span className={styles.muted}>{t('total', { count: total })}</span> : null}
    >
      {!byStatus ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : (
        <ul className={styles.statusList}>
          {rows.map((status) => (
            <li key={status} className={styles.statusRow}>
              <StatusTag value={status} meta={TENANT_STATUS_META} group="tenantStatus" />
              <span className={styles.statusCount}>{fmt.count(byStatus[status] ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
