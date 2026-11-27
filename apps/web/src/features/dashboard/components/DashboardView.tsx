'use client';

import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import { PERMISSION, RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { LIST_SEPARATOR, countChangePercent, moneyChangePercent } from '@xeprime/domain';
import { isShopOwner } from '@/constants/account-nav';
import { ROUTES, receiptsPath } from '@/constants/routes';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { withBranchParam } from '@/features/branches/branch-link';
import { BranchFilterSelect } from '@/features/branches/components/BranchFilterSelect';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { useFleetSummary } from '@/features/vehicles/hooks/use-fleet-summary';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs, toAppTz } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { dashboardMonthRange, dashboardRevenueSeriesFilters } from '../api';
import { answerParts, greetingKey, todayLabel, utilizationPointChange } from '../dashboard-model';
import { useDashboardLinks } from '../hooks/use-dashboard-links';
import { useDashboardMoney } from '../hooks/use-dashboard-money';
import { usePartnerOverview } from '../hooks/use-partner-overview';
import type { PartnerOverview } from '../types';
import { AgendaPanel } from './AgendaPanel';
import { FleetPlanPanel } from './FleetPlanPanel';
import { MonthKpis, type MonthKpiCell } from './MonthKpis';
import { OwnerVehiclesPanel } from './OwnerVehiclesPanel';
import { ReputationPanel } from './ReputationPanel';
import { ShopOnboardingCard } from './ShopOnboardingCard';
import { TodayFocus } from './TodayFocus';
import { REVENUE_SOURCE_PARAM } from '@/features/finance/vehicle-finance';
import { RevenueCard, TripsCard } from './TrendCards';
import { WalletPanel } from './WalletPanel';
import styles from './DashboardView.module.css';

/**
 * TỔNG QUAN của site partner — Figma Partner-XePrime "Overview" `24138:80351`, MỘT màn cho gian
 * hàng tuyến gói và chủ xe cá nhân (ADR 0085 điều 1: khối không áp dụng thì vắng).
 *
 * Bố cục: lời chào + câu tóm tắt · bốn ô việc · hai cột [lịch giao & nhận · so sánh tháng · thu chi
 * 30 ngày + đơn & chuyến 6 tháng | ví · đội xe & gói · uy tín].
 *
 * Logic giữ nguyên bản trước và ĐỒNG BỘ với app Partner (`ShopDashboardScreen`): mỗi khối tự vắng
 * khi người xem không có quyền của nó; tiền đọc từ sổ thu chi (`useDashboardMoney`); ô chi nhánh
 * lọc mọi khối xe/đơn/tiền (ADR 0052). Quyết định 17/11/2026 khi đổi bản vẽ: lời chào theo tên cho
 * CẢ HAI tuyến; "Xe sẵn sàng" vào thẻ Đội xe; "Tiền cọc đang giữ" là một ô của khối so sánh tháng;
 * "Thu chi hôm nay" rời Tổng quan (đã có ở Lịch sử giao dịch).
 *
 * Chủ xe cá nhân (tuyến hoa hồng): sổ tổng hợp là năng lực gói (ADR 0027 điều 1) — ô doanh thu,
 * thu chi 30 ngày tự vắng theo cờ `finance`, server không trả `trend`; "Xe của bạn" thay phần chợ;
 * ví hiện thêm thu nhập tháng; không phần gói, không thẻ ba bước mở gian hàng.
 */
export function DashboardView() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  const commission = resolvePartnerTrack(user) === PARTNER_TRACK.COMMISSION;
  const now = dayjs();
  const greetName = user?.displayName?.trim();
  const title = greetName ? t(`greeting.${greetingKey(now)}`, { name: greetName }) : t('title');

  const { filters, setFilters } = useUrlFilters<{ branchId?: string }>((sp) => ({
    branchId: sp.get('branchId') ?? undefined,
  }));
  const branchId = filters.branchId;
  const branch = useBranchFilter({
    value: branchId,
    onChange: (next) => setFilters({ branchId: next }),
  });

  const canViewVehicles = has(PERMISSION.VEHICLE_VIEW);
  const overview = usePartnerOverview(branchId);
  const money = useDashboardMoney(branchId);
  const fleet = useFleetSummary(canViewVehicles, branchId);
  const links = useDashboardLinks(branchId);
  const data = overview.data;
  const withBranch = (href: string) => withBranchParam(href, branchId ?? null);

  const moneyText = (isError: boolean, value: string | undefined) =>
    isError ? tCommon('states.error') : (value ?? tCommon('labels.emptyValue'));

  // Ô của khối so sánh tháng — cùng tập, cùng thứ tự với `MonthKpis` của app Partner.
  const cells: MonthKpiCell[] = [];
  if (money.visible) {
    const s = money.summary.data;
    const prev = money.previousSummary.data;
    cells.push({
      key: 'revenue',
      label: t('stats.revenue'),
      value: moneyText(money.summary.isError, s ? fmt.money(s.revenue) : undefined),
      href: withBranch(
        receiptsPath.filtered({
          ...dashboardMonthRange(),
          status: RECEIPT_STATUS.APPROVED,
          type: RECEIPT_TYPE.INCOME,
          sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
        }),
      ),
      loading: money.summary.isPending,
      ...(s && prev
        ? {
            change: {
              value: moneyChangePercent(s.revenue, prev.revenue),
              previous: fmt.moneyCompact(prev.revenue),
            },
          }
        : {}),
    });
  }
  const month = data?.month;
  if (month !== null) {
    const loading = !month && !overview.isError;
    const missing = tCommon('labels.emptyValue');
    cells.push(
      {
        key: 'newBookings',
        label: t('kpi.newBookings'),
        value: month ? fmt.count(month.newBookings) : missing,
        href: links.allBookings,
        loading,
        ...(month
          ? {
              change: {
                value: countChangePercent(month.newBookings, month.newBookingsPrevious),
                previous: fmt.count(month.newBookingsPrevious),
              },
            }
          : {}),
      },
      {
        key: 'completedTrips',
        label: t('kpi.completedTrips'),
        value: month ? fmt.count(month.completedTrips) : missing,
        href: links.completed,
        loading,
        ...(month
          ? {
              change: {
                value: countChangePercent(month.completedTrips, month.completedTripsPrevious),
                previous: fmt.count(month.completedTripsPrevious),
              },
            }
          : {}),
      },
      {
        key: 'utilization',
        label: t('kpi.utilization'),
        value: month
          ? month.utilizationPercent === null
            ? t('kpi.utilizationEmpty')
            : t('kpi.utilizationValue', { value: month.utilizationPercent })
          : missing,
        href: links.calendar,
        loading,
        ...(month && month.utilizationPercent !== null
          ? {
              change: {
                value: utilizationPointChange(
                  month.utilizationPercent,
                  month.utilizationPercentPrevious,
                ),
                unit: 'points' as const,
                ...(month.utilizationPercentPrevious != null
                  ? {
                      previous: t('kpi.utilizationValue', {
                        value: month.utilizationPercentPrevious,
                      }),
                    }
                  : {}),
              },
            }
          : {}),
      },
    );
  }
  if (money.visible) {
    cells.push({
      key: 'deposit',
      label: t('stats.deposit'),
      value: moneyText(
        money.summary.isError,
        money.summary.data ? fmt.money(money.summary.data.depositHeld) : undefined,
      ),
      href: withBranch(
        receiptsPath.filtered({
          status: RECEIPT_STATUS.APPROVED,
          sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
        }),
      ),
      loading: money.summary.isPending,
    });
  }

  const trend = data?.trend ?? null;
  const showTrips = data ? trend !== null : overview.isError;
  const showCharts = money.visible || showTrips;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>
            {todayLabel(fmt, now)}
            {data && answerParts(data) !== null ? '.' : null}
            {data ? <AnswerText overview={data} /> : null}
          </p>
        </div>
        <BranchFilterSelect branch={branch} value={branchId} className={styles.branch} />
      </header>

      {commission ? null : <ShopOnboardingCard vehicleCount={fleet.data?.total} />}

      <TodayFocus overview={data} isError={overview.isError} links={links} />

      <div className={styles.columns}>
        <div className={styles.main}>
          {data?.agenda !== null ? (
            <AgendaPanel
              agenda={data?.agenda ?? undefined}
              generatedAt={data?.generatedAt}
              isError={overview.isError}
              onRetry={() => void overview.refetch()}
              bookingHref={links.booking}
              moreHref={links.allBookings}
            />
          ) : null}

          {commission ? <OwnerVehiclesPanel links={links} /> : null}

          <MonthKpis
            month={toAppTz(now).month() + 1}
            cells={cells}
            {...(money.visible
              ? { report: { href: withBranch(ROUTES.MANAGE.FINANCE), label: t('kpi.report') } }
              : {})}
          />

          {showCharts ? (
            <div
              className={cx(styles.charts, !(money.visible && showTrips) && styles.chartsSingle)}
            >
              {money.visible ? (
                <RevenueCard
                  series={money.series}
                  bySource={money.bySource}
                  detailHref={(view) => {
                    // Màn Tổng quan doanh thu đúng 30 ngày của thẻ, mở sẵn góc nhìn nguồn.
                    const { from, to } = dashboardRevenueSeriesFilters();
                    const params = new URLSearchParams({ from: from ?? '', to: to ?? '' });
                    if (view) params.set(REVENUE_SOURCE_PARAM, view);
                    return withBranch(`${ROUTES.MANAGE.FINANCE}?${params.toString()}`);
                  }}
                />
              ) : null}
              {showTrips ? (
                <TripsCard
                  trend={trend ?? undefined}
                  loading={overview.isPending}
                  isError={overview.isError}
                  onRetry={() => void overview.refetch()}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className={styles.side}>
          {isShopOwner(user) ? <WalletPanel showIncome={commission} href={links.balance} /> : null}
          <FleetPlanPanel
            showPlan={has(PERMISSION.SUBSCRIPTION_VIEW) && !commission}
            showMarket={data?.market !== null && !commission}
            market={data?.market ?? undefined}
            fleet={canViewVehicles ? fleet : null}
            links={links}
          />
          <ReputationPanel metrics={data?.reputation} />
        </aside>
      </div>
    </div>
  );
}

/**
 * Câu tóm tắt sau ngày — "Hôm nay: 13 việc đã quá giờ · 3 yêu cầu chờ bạn trả lời." Cùng
 * `answerParts` với app Partner; phần quá giờ tô đỏ, phần yêu cầu tô đậm như bản vẽ.
 */
function AnswerText({ overview }: { overview: PartnerOverview }) {
  const t = useTranslations('Dashboard.answer');
  const parts = answerParts(overview);
  if (parts === null) return null;
  if (parts.length === 0) return <> {t('calm')}</>;

  const MARK = '\u0000';
  const [before = '', after = ''] = t('busy', { parts: MARK }).split(MARK);
  const nodes: ReactNode[] = parts.map((part, index) => (
    <Fragment key={part.key}>
      {index > 0 ? LIST_SEPARATOR : null}
      <span
        className={cx(
          part.key === 'overdue' && styles.answerDanger,
          part.key === 'requests' && styles.answerStrong,
        )}
      >
        {t(part.key, { count: part.count })}
      </span>
    </Fragment>
  ));
  return (
    <>
      {' '}
      {before}
      {nodes}
      {after}
    </>
  );
}
