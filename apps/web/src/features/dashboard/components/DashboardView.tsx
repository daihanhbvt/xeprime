'use client';

import { CarOutlined, DollarOutlined, LockOutlined, SwapOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  DASHBOARD_TREND_MONTHS,
  PERMISSION,
  RECEIPT_SOURCE_GROUP,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
} from '@xeprime/types';
import { moneyChangePercent } from '@xeprime/domain';
import { CountTrendChart } from '@/components/chart/CountTrendChart';
import { RevenueTrendChart } from '@/components/chart/RevenueTrendChart';
import { isShopOwner } from '@/constants/account-nav';
import { receiptsPath } from '@/constants/routes';
import { withBranchParam } from '@/features/branches/branch-link';
import { BranchFilterSelect } from '@/features/branches/components/BranchFilterSelect';
import { useBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { useFleetSummary } from '@/features/vehicles/hooks/use-fleet-summary';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { DASHBOARD_REVENUE_DAYS, dashboardMonthRange, dashboardTodayRange } from '../api';
import { todayLabel } from '../dashboard-model';
import { useDashboardAnswer } from '../hooks/use-dashboard-answer';
import { useDashboardLinks } from '../hooks/use-dashboard-links';
import { useDashboardMoney } from '../hooks/use-dashboard-money';
import { usePartnerOverview } from '../hooks/use-partner-overview';
import { AgendaPanel } from './AgendaPanel';
import { ChangeBadge } from './ChangeBadge';
import { DashboardHeader } from './DashboardHeader';
import { DashboardPanel } from './DashboardPanel';
import { MarketPanel } from './MarketPanel';
import { MonthKpis } from './MonthKpis';
import { PlanPanel } from './PlanPanel';
import { ReceiptMiniList } from './ReceiptMiniList';
import { ReputationPanel } from './ReputationPanel';
import { ShopOnboardingCard } from './ShopOnboardingCard';
import { StatCard } from './StatCard';
import { TodayFocus } from './TodayFocus';
import { WalletPanel } from './WalletPanel';
import styles from './DashboardView.module.css';

/**
 * TỔNG QUAN của gian hàng TUYẾN GÓI — đúng khuôn bảng điều khiển của UX §1.5:
 *
 *  1. Câu trả lời ("Hôm nay: giao 3 xe · 1 yêu cầu chờ bạn trả lời") + bốn ô VIỆC CẦN LÀM;
 *  2. KPI tháng này, mỗi thẻ so cùng kỳ tháng trước và dẫn tới danh sách tạo nên nó;
 *  3. Lịch giao/nhận 7 ngày + biểu đồ; cột phải là tiền, gói, uy tín, xe trên chợ.
 *
 * Mỗi khối tự ẩn khi người xem không có quyền của nó (server trả `null`, hoặc nơi gọi không chạy
 * truy vấn) — một `shop_staff` không thấy thẻ doanh thu, một `shop_viewer` không thấy gói. Tiền
 * đọc từ sổ thu chi (`useDashboardMoney`), không phải từ `/dashboard/overview`.
 *
 * Cũng là Tổng quan trong phiên hỗ trợ gian hàng (ADR 0050): ví ẩn vì phiên không bao giờ là chủ,
 * khối tiền ẩn vì phiên không có `finance.view`.
 */
export function DashboardView() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();

  /*
   * Ô "Chi nhánh" của Tổng quan — ADR 0052. Làm TRỌN: mọi thẻ xe/đơn/tiền đi theo cùng một chi
   * nhánh; một con số của chi nhánh đứng cạnh một con số của cả gian hàng là đúng cái hiểu lầm mà
   * ADR này gỡ đi. Uy tín và gói là của cả gian hàng — hai panel đó nói đúng như vậy.
   */
  const { filters, setFilters } = useUrlFilters<{ branchId?: string }>((sp) => ({
    branchId: sp.get('branchId') ?? undefined,
  }));
  const branchId = filters.branchId;
  const branch = useBranchFilter({
    value: branchId,
    onChange: (next) => setFilters({ branchId: next }),
  });

  const overview = usePartnerOverview(branchId);
  const money = useDashboardMoney(branchId);
  const fleet = useFleetSummary(has(PERMISSION.VEHICLE_VIEW), branchId);
  const links = useDashboardLinks(branchId);
  const answer = useDashboardAnswer(overview.data);
  const data = overview.data;

  const withBranch = (href: string) => withBranchParam(href, branchId ?? null);

  /*
   * Đích của hai thẻ tiền LỌC ĐÚNG bộ mà con số được cộng ra — cùng tham số `FinanceOverviewCards`
   * dùng: `revenue` đã LOẠI tiền giữ hộ và chỉ tính phiếu đã duyệt; thẻ cọc là số TẠI THỜI ĐIỂM
   * NÀY nên không mang kỳ.
   */
  const revenueHref = withBranch(
    receiptsPath.filtered({
      ...dashboardMonthRange(),
      status: RECEIPT_STATUS.APPROVED,
      type: RECEIPT_TYPE.INCOME,
      sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
    }),
  );
  const depositHref = withBranch(
    receiptsPath.filtered({ status: RECEIPT_STATUS.APPROVED, sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS }),
  );

  /**
   * Giá trị của một thẻ tiền: lỗi nói ra thành chữ, chưa có dữ liệu thì để `loading` của `StatCard`
   * lo. Nuốt lỗi thành `—` là cách một thẻ hỏng trông y hệt một gian hàng chưa có doanh thu.
   */
  function moneyValue<T>(query: UseQueryResult<T>, render: (value: T) => string): string {
    if (query.isError) return tCommon('states.error');
    if (!query.data) return tCommon('labels.emptyValue');
    return render(query.data);
  }

  const fleetCards = has(PERMISSION.VEHICLE_VIEW) ? (
    <StatCard
      label={t('stats.available')}
      value={fleet.data ? `${fmt.count(fleet.data.available)}/${fmt.count(fleet.data.total)}` : '—'}
      hint={
        fleet.data
          ? t('kpi.fleetHint', {
              renting: fmt.count(fleet.data.renting),
              maintenance: fmt.count(fleet.data.maintenance),
            })
          : undefined
      }
      icon={CarOutlined}
      tone="green"
      loading={fleet.isLoading}
      href={links.availableVehicles}
    />
  ) : null;

  const revenueCard = money.visible ? (
    <StatCard
      label={t('stats.revenue')}
      value={moneyValue(money.summary, (s) => fmt.money(s.revenue))}
      hint={t('stats.revenueHint')}
      icon={DollarOutlined}
      tone="gold"
      loading={money.summary.isLoading}
      href={revenueHref}
      change={
        money.summary.data && money.previousSummary.data ? (
          <ChangeBadge
            value={moneyChangePercent(money.summary.data.revenue, money.previousSummary.data.revenue)}
          />
        ) : null
      }
    />
  ) : null;

  const depositCard = money.visible ? (
    <StatCard
      label={t('stats.deposit')}
      value={moneyValue(money.summary, (s) => fmt.money(s.depositHeld))}
      // Mẫu số chỉ có nghĩa khi con số bên trên có nghĩa — lỗi thì bỏ trống.
      hint={
        money.summary.data
          ? t('stats.depositHint', { count: money.summary.data.depositHeldBookings })
          : undefined
      }
      icon={LockOutlined}
      tone="gold"
      loading={money.summary.isLoading}
      href={depositHref}
    />
  ) : null;

  const seriesEmpty =
    money.series.data !== undefined &&
    money.series.data.buckets.every((b) => b.revenue === '0' && b.cost === '0');
  const trend = data?.trend ?? null;
  const trendEmpty = trend !== null && trend.every((p) => p.newBookings === 0 && p.completedTrips === 0);
  const showCharts = money.visible || trend !== null;

  return (
    <div className={styles.wrap}>
      <DashboardHeader
        title={t('title')}
        subtitle={todayLabel(fmt, dayjs())}
        answer={answer}
        actions={<BranchFilterSelect branch={branch} value={branchId} className={styles.branch} />}
      />

      {/*
        Gian hàng chưa có xe / chưa duyệt xong: ba bước cần làm đứng TRƯỚC mọi con số, vì lúc đó
        mọi ô đều là 0 và không ô nào nói được việc gì tiếp theo. Thẻ tự ẩn khi hết việc.
      */}
      <ShopOnboardingCard vehicleCount={fleet.data?.total} />

      <TodayFocus overview={data} isError={overview.isError} links={links} />

      <MonthKpis
        month={data?.month}
        loading={overview.isLoading}
        links={links}
        leading={revenueCard}
        trailing={
          <>
            {fleetCards}
            {depositCard}
          </>
        }
      />

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

          {showCharts ? (
            <div className={styles.charts}>
              {money.visible ? (
                <RevenueTrendChart
                  points={money.series.data?.buckets ?? []}
                  labelOf={(bucket) => fmt.dateKey(bucket)}
                  title={t('charts.revenueTitle', { days: DASHBOARD_REVENUE_DAYS })}
                  description={t('charts.revenueDescription')}
                  height={240}
                  loading={money.series.isLoading}
                  error={
                    money.series.isError && !money.series.data
                      ? { title: t('charts.revenueError'), onRetry: () => void money.series.refetch() }
                      : null
                  }
                  empty={
                    seriesEmpty
                      ? {
                          title: t('charts.revenueEmpty', { days: DASHBOARD_REVENUE_DAYS }),
                          description: t('charts.revenueEmptyHint'),
                        }
                      : null
                  }
                />
              ) : null}
              {trend !== null ? (
                <CountTrendChart
                  points={(trend ?? []).map((p) => ({
                    key: p.period,
                    values: { newBookings: p.newBookings, completedTrips: p.completedTrips },
                  }))}
                  series={[
                    { key: 'newBookings', label: t('charts.newBookings') },
                    { key: 'completedTrips', label: t('charts.completedTrips') },
                  ]}
                  labelOf={(period) => fmt.monthYear(new Date(`${period}-15T12:00:00Z`))}
                  title={t('charts.tripsTitle', { months: DASHBOARD_TREND_MONTHS })}
                  description={t('charts.tripsDescription')}
                  loading={overview.isLoading}
                  error={
                    overview.isError && !data
                      ? { title: t('charts.tripsError'), onRetry: () => void overview.refetch() }
                      : null
                  }
                  empty={trendEmpty ? { title: t('charts.tripsEmpty', { months: DASHBOARD_TREND_MONTHS }) } : null}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className={styles.side}>
          {isShopOwner(user) ? <WalletPanel showIncome={false} href={links.balance} /> : null}
          {has(PERMISSION.SUBSCRIPTION_VIEW) ? <PlanPanel href={links.subscription} /> : null}
          {data?.market !== null ? <MarketPanel market={data?.market ?? undefined} links={links} /> : null}
          <ReputationPanel metrics={data?.reputation} />
          {/* Sổ quỹ hôm nay đi cùng điều kiện với thẻ tiền — cùng một tính năng, cùng một quyền. */}
          {money.visible ? (
            <DashboardPanel title={t('panels.receipts')} icon={<SwapOutlined />}>
              <ReceiptMiniList
                items={money.todayReceipts.data?.items ?? []}
                loading={money.todayReceipts.isLoading}
                empty={
                  money.todayReceipts.isError ? tCommon('states.error') : t('panels.receiptsEmpty')
                }
                onSelect={() => router.push(withBranch(receiptsPath.filtered(dashboardTodayRange())))}
              />
            </DashboardPanel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
