import { useCallback, useMemo } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { dayjs, moneyChangePercent } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import DollarOutlined from '@ant-design/icons-svg/es/asn/DollarOutlined';
import LockOutlined from '@ant-design/icons-svg/es/asn/LockOutlined';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { AccountTrackNotice } from '@/features/account/components/AccountTrackNotice';
import { useOpenPushPermissionGate } from '@/features/notifications/push-permission-gate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { withBranchParam } from '@/features/branches/branch-link';
import { BranchFilterField } from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { dashboardMonthRange } from './api';
import { greetingKey, todayLabel } from './dashboard-model';
import { AgendaPanel } from './components/AgendaPanel';
import { ShopOnboardingCard } from './components/ShopOnboardingCard';
import {
  FleetPlanPanel,
  OwnerVehiclesPanel,
  ReputationPanel,
  WalletPanel,
} from './components/SidePanels';
import { AnswerBanner, TodayFocus } from './components/TodayFocus';
import { TrendCard } from './components/TrendPanels';
import {
  useDashboardAnswer,
  useDashboardLinks,
  useDashboardRefresh,
  useDashboardMoney,
  useFleetStats,
  useIsShopOwner,
  usePartnerOverview,
} from './hooks/use-dashboard';
import { useMonthKpiCards } from './hooks/use-month-kpis';
import { MonthKpis, type KpiCard } from './components/MonthKpis';

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
  // `<Screen>` dựng cột giữa màn trên iPad, nên nội dung bên trong giữ lề điện thoại.
  const gutter = layout.screenX;
  const t = useTranslations('Dashboard');
  const tCommon = useTranslations('Common.labels');
  const tStates = useTranslations('Common.states');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();
  useOpenPushPermissionGate();
  const isOwner = useIsShopOwner();
  const session = useCurrentUser();
  /*
   * MỘT Tổng quan cho cả hai tuyến (ADR 0085 điều 1 — web `DashboardView`): chủ xe cá nhân dùng
   * chính màn này, khối của gói tự vắng. Hai khác biệt có chủ đích giữ từ Tổng quan riêng cũ của họ:
   * "Xe của bạn" thay số đếm chợ, ví hiện thu nhập tháng; không thẻ Gói, không
   * thẻ ba bước mở gian hàng.
   */
  const commission = resolvePartnerTrack(session.data) === PARTNER_TRACK.COMMISSION;

  const canViewVehicles = has(PERMISSION.VEHICLE_VIEW);
  const { branchId, filter: branchFilter } = useScreenBranchFilter();
  const overview = usePartnerOverview(branchId);
  const fleet = useFleetStats(canViewVehicles, branchId);
  const money = useDashboardMoney(branchId);
  const links = useDashboardLinks(branchId);
  const refresh = useDashboardRefresh();
  const answer = useDashboardAnswer(overview.data);
  const data = overview.data;
  const monthCards = useMonthKpiCards(data?.month, overview.isError, links);

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

  /* Web: bấm một phiếu của "Thu Chi hôm nay" mở sổ thu chi lọc HÔM NAY (kèm chi nhánh). */
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
  /** Web `moneyValue`: lỗi nói ra thành chữ (`Common.states.error`), chưa có dữ liệu thì `-` - không bao giờ `0`. */
  const cellValue = (isError: boolean, value: string | undefined): string =>
    isError ? tStates('error') : (value ?? tCommon('emptyValue'));

  /* Thứ tự như web `MonthKpis`: doanh thu (leading) · ba KPI vận hành · xe sẵn sàng · cọc (trailing). */
  const cards: KpiCard[] = [];

  if (money.visible) {
    const s = money.summary.data;
    const prev = money.previousSummary.data;
    cards.push({
      key: 'revenue',
      icon: DollarOutlined,
      label: t('stats.revenue'),
      hint: t('stats.revenueHint'),
      value: cellValue(money.summary.isError, s ? fmt.money(s.revenue) : undefined),
      ...(s && prev
        ? {
            change: {
              value: moneyChangePercent(s.revenue, prev.revenue),
              previous: fmt.moneyCompact(prev.revenue),
            },
          }
        : {}),
      tone: 'gold',
      loading: money.summary.isPending,
      onPress: goRevenueReceipts,
    });
  }

  cards.push(...monthCards);

  // "Xe sẵn sàng" nằm trong thẻ Đội xe (`FleetPlanPanel`), cùng chỗ với web (chốt 17/11/2026).
  if (money.visible) {
    cards.push({
      key: 'deposit',
      icon: LockOutlined,
      label: t('stats.deposit'),
      ...(money.summary.data
        ? { hint: t('stats.depositHint', { count: money.summary.data.depositHeldBookings }) }
        : {}),
      value: cellValue(
        money.summary.isError,
        money.summary.data ? fmt.money(money.summary.data.depositHeld) : undefined,
      ),
      tone: 'gold',
      loading: money.summary.isPending,
      onPress: goDepositReceipts,
    });
  }

  const trend = data?.trend ?? null;
  const now = dayjs();
  // Lời chào theo tên tài khoản cho CẢ HAI tuyến — như web (Figma Overview, chốt 17/11/2026).
  const greetName = session.data?.displayName?.trim();
  const title = greetName ? t(`greeting.${greetingKey(now)}`, { name: greetName }) : t('title');

  const goReport = useCallback(
    () => navigateOnce(withBranchParam(ROUTES.manage.finance(), branchId)),
    [navigateOnce, branchId],
  );
  const report = useMemo(
    () => (money.visible ? { label: t('kpi.report'), onPress: goReport } : undefined),
    [money.visible, t, goReport],
  );
  const refetchOverview = overview.refetch;
  const retryOverview = useCallback(() => void refetchOverview(), [refetchOverview]);
  /* Tab "Đơn & chuyến": lần tải đầu lỗi thì chưa biết tuyến có `trend` không - vẫn hiện lỗi + thử lại. */
  const showTrips = data ? trend !== null : overview.isError;
  const tripsState = useMemo(
    () =>
      showTrips
        ? {
            trend: trend ?? undefined,
            loading: overview.isPending,
            isError: overview.isError,
            onRetry: retryOverview,
          }
        : null,
    [showTrips, trend, overview.isPending, overview.isError, retryOverview],
  );
  const showMarket = data?.market !== null && !commission;

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      >
        {/* Dải tuyến (chờ trả gói / lỗi cấu hình gói) - chủ xe cá nhân, TRÊN tiêu đề như web `OwnerLiteHome`. */}
        {commission ? (
          <YStack px={gutter} pt={space.md}>
            <AccountTrackNotice />
          </YStack>
        ) : null}
        <ManagePageTitle title={title} total={todayLabel(fmt, now)} />

        {/*
          Thứ tự theo Figma Overview MB (24175:52345), các khối cách 16: phạm vi chi nhánh · câu trả
          lời · ba bước mở gian hàng · bốn ô việc · ví · lịch giao nhận · (tuyến hoa hồng) xe của bạn ·
          KPI tháng · thu chi / đơn & chuyến · đội xe & gói · uy tín.
        */}
        <YStack px={gutter} gap={PAGE_GAP} pb={layout.section}>
          <BranchFilterField filter={branchFilter} value={branchId} scope />
          <AnswerBanner answer={answer} />
          {commission ? null : <ShopOnboardingCard vehicleCount={fleet.data?.total} />}
          <TodayFocus overview={data} isError={overview.isError} links={links} />

          {isOwner ? <WalletPanel showIncome={commission} href={links.balance} /> : null}

          {data?.agenda !== null ? (
            <AgendaPanel
              agenda={data?.agenda ?? undefined}
              generatedAt={data?.generatedAt}
              isError={overview.isError}
              onRetry={retryOverview}
              bookingHref={links.booking}
              moreHref={links.allBookings}
            />
          ) : null}

          {/* Chủ xe 1–3 xe: thấy CHÍNH chiếc xe thay vì số đếm "Xe trên chợ" của gian hàng. */}
          {commission ? <OwnerVehiclesPanel links={links} /> : null}

          <MonthKpis cards={cards} {...(report ? { report } : {})} />

          <TrendCard series={money.visible ? money.series : null} trips={tripsState} />

          {/*
            App Partner: Tổng quan CHỈ hiện đội xe - thông tin gói nằm ở Thông tin gian hàng (sau cờ
            `isPlanPromotionEnabled`), người dùng chốt 13/11/2026.
          */}
          <FleetPlanPanel
            showPlan={false}
            showMarket={showMarket}
            market={data?.market ?? undefined}
            fleet={canViewVehicles ? fleet : null}
            links={links}
          />
          <ReputationPanel metrics={data?.reputation} />
          {/* "Thu chi hôm nay" rời Tổng quan (cả web) - đã có ở Lịch sử giao dịch, chốt 17/11/2026. */}
        </YStack>
      </Screen>
    </>
  );
}

/** Figma Overview MB: các khối cách 16. */
const PAGE_GAP = 16;
