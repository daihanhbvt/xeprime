import { useCallback, useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { dayjs, moneyChangePercent } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { ReceiptDetailSheet } from '@/features/finance/components/ReceiptDetailSheet';
import { useOpenPushPermissionGate } from '@/features/notifications/push-permission-gate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors } from '@/theme/tokens';
import { withBranchParam } from '@/features/branches/branch-link';
import { BranchFilterField } from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { dashboardMonthRange } from './api';
import { todayLabel } from './dashboard-model';
import { AgendaPanel } from './components/AgendaPanel';
import { DashboardPanel } from './components/DashboardPanel';
import { ReceiptMiniList } from './components/ReceiptMiniList';
import { ShopOnboardingCard } from './components/ShopOnboardingCard';
import { MarketPanel, PlanPanel, ReputationPanel, WalletPanel } from './components/SidePanels';
import { AnswerBanner, TodayFocus } from './components/TodayFocus';
import { RevenueTrendPanel, TripsTrendPanel } from './components/TrendPanels';
import {
  useDashboardAnswer,
  useDashboardLinks,
  useDashboardRefresh,
  useDashboardMoney,
  useFleetStats,
  useIsShopOwner,
  usePartnerOverview,
} from './hooks/use-dashboard';
import { useChangeText, useMonthKpiCells } from './hooks/use-month-kpis';

/**
 * Tổng quan gian hàng TUYẾN GÓI — bản native của `DashboardView` bên web (PR #170):
 *
 *  1. Câu trả lời đầu trang + bốn ô VIỆC CẦN LÀM (`GET /dashboard/overview`);
 *  2. KPI tháng này (doanh thu · đơn mới · chuyến hoàn thành · lấp đầy · xe · cọc), mỗi ô so cùng
 *     kỳ tháng trước và dẫn tới danh sách tạo nên nó;
 *  3. Lịch giao/nhận 7 ngày, biểu đồ doanh thu 30 ngày + đơn/chuyến 6 tháng;
 *  4. Ví (chỉ chủ), gói (`subscription.view`), xe trên chợ, uy tín, sổ quỹ hôm nay.
 *
 * Mỗi khối tự ẩn khi thiếu quyền (server trả `null`, hoặc query không chạy). Lỗi một khối không
 * kéo cả màn, và lỗi không bao giờ hoá thành số 0.
 */
export function ShopDashboardScreen() {
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const navigateOnce = useNavigateOnce();
  useOpenPushPermissionGate();
  const isOwner = useIsShopOwner();
  const [receiptDetailId, setReceiptDetailId] = useState<string | null>(null);

  const canViewVehicles = has(PERMISSION.VEHICLE_VIEW);
  const { branchId, filter: branchFilter } = useScreenBranchFilter();
  const overview = usePartnerOverview(branchId);
  const fleet = useFleetStats(canViewVehicles, branchId);
  const money = useDashboardMoney(branchId);
  const links = useDashboardLinks(branchId);
  const refresh = useDashboardRefresh();
  const answer = useDashboardAnswer(overview.data);
  const change = useChangeText();
  const data = overview.data;
  const monthCells = useMonthKpiCells(data?.month, overview.isError, links);

  const goRevenueReceipts = useCallback(
    () =>
      navigateOnce(
        withBranchParam(
          ROUTES.manage.receipts({
            ...dashboardMonthRange(),
            status: RECEIPT_STATUS.APPROVED,
            type: RECEIPT_TYPE.INCOME,
            sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
          }),
          branchId,
        ),
      ),
    [navigateOnce, branchId],
  );

  /* Thẻ cọc KHÔNG mang kỳ: `depositHeld` là số TẠI THỜI ĐIỂM NÀY. */
  const goDepositReceipts = useCallback(
    () =>
      navigateOnce(
        withBranchParam(
          ROUTES.manage.receipts({
            status: RECEIPT_STATUS.APPROVED,
            sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
          }),
          branchId,
        ),
      ),
    [navigateOnce, branchId],
  );

  /** Lỗi nói ra thành CHỮ, chưa có dữ liệu thì `—` — không bao giờ `0`. */
  const cellValue = (isError: boolean, value: string | undefined): string =>
    isError ? tCommon('unknown') : (value ?? tCommon('emptyValue'));

  const cells: StatCell[] = [];

  if (money.visible) {
    const s = money.summary.data;
    const prev = money.previousSummary.data;
    cells.push({
      key: 'revenue',
      icon: 'cash-outline',
      label: t('stats.revenue'),
      hint: s && prev ? [t('stats.revenueHint'), change(moneyChangePercent(s.revenue, prev.revenue))] : t('stats.revenueHint'),
      value: cellValue(money.summary.isError, s ? fmt.money(s.revenue) : undefined),
      tone: colors.primaryActive,
      surface: colors.primaryLight,
      onPress: goRevenueReceipts,
    });
  }

  cells.push(...monthCells);

  if (canViewVehicles) {
    cells.push({
      key: 'available',
      icon: 'car-outline',
      label: t('stats.available'),
      value: cellValue(
        fleet.isError,
        fleet.data ? `${fmt.count(fleet.data.available)}/${fmt.count(fleet.data.total)}` : undefined,
      ),
      ...(fleet.data
        ? {
            hint: t('kpi.fleetHint', {
              renting: fmt.count(fleet.data.renting),
              maintenance: fmt.count(fleet.data.maintenance),
            }),
          }
        : {}),
      tone: colors.success,
      surface: colors.successSurface,
      onPress: () => navigateOnce(links.availableVehicles),
    });
  }

  if (money.visible) {
    cells.push({
      key: 'deposit',
      icon: 'lock-closed-outline',
      label: t('stats.deposit'),
      ...(money.summary.data
        ? { hint: t('stats.depositHint', { count: money.summary.data.depositHeldBookings }) }
        : {}),
      value: cellValue(
        money.summary.isError,
        money.summary.data ? fmt.money(money.summary.data.depositHeld) : undefined,
      ),
      tone: colors.primaryActive,
      surface: colors.primaryLight,
      onPress: goDepositReceipts,
    });
  }

  const trend = data?.trend ?? null;

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      >
        <ManagePageTitle title={t('title')} total={todayLabel(fmt, dayjs())} />

        <YStack px={layout.screenX} gap={layout.section} pb={layout.section}>
          <BranchFilterField filter={branchFilter} value={branchId} />
          <AnswerBanner answer={answer} />
          <ShopOnboardingCard vehicleCount={fleet.data?.total} />
          <TodayFocus overview={data} isError={overview.isError} links={links} />

          {cells.length > 0 ? (
            <Card padded={false}>
              <StatGrid variant="list" cells={cells} emphasis="even" />
            </Card>
          ) : null}

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

          {money.visible ? <RevenueTrendPanel series={money.series} /> : null}
          {/* Lần tải đầu lỗi: chưa biết tuyến có `trend` không — vẫn hiện panel với lỗi + thử lại. */}
          {(data ? trend !== null : overview.isError) ? (
            <TripsTrendPanel
              trend={trend ?? undefined}
              loading={overview.isPending}
              isError={overview.isError}
              onRetry={() => void overview.refetch()}
            />
          ) : null}

          {isOwner ? <WalletPanel showIncome={false} href={links.balance} /> : null}
          {/* Thông tin tài khoản & hạn mức chỉ hiện khi nền tảng bật cờ (quy định store). */}
          {isPlanPromotionEnabled && has(PERMISSION.SUBSCRIPTION_VIEW) ? <PlanPanel href={links.subscription} /> : null}
          {data?.market !== null ? <MarketPanel market={data?.market ?? undefined} links={links} /> : null}
          <ReputationPanel metrics={data?.reputation} />

          {money.visible ? (
            <DashboardPanel
              title={t('panels.receipts')}
              icon="swap-horizontal"
              tone="success"
              loading={money.todayReceipts.isPending}
              error={money.todayReceipts.isError && !money.todayReceipts.data}
              onRetry={() => void money.todayReceipts.refetch()}
              empty={t('panels.receiptsEmpty')}
            >
              {money.todayReceipts.data?.items.length ? (
                <ReceiptMiniList
                  items={money.todayReceipts.data.items}
                  onSelect={(receipt) => setReceiptDetailId(receipt.id)}
                />
              ) : null}
            </DashboardPanel>
          ) : null}
        </YStack>
      </Screen>

      <ReceiptDetailSheet receiptId={receiptDetailId} onClose={() => setReceiptDetailId(null)} />
    </>
  );
}
