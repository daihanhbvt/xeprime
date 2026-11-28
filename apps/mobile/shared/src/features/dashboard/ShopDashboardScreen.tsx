import { useCallback, useMemo } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { moneyChangePercent } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import DollarOutlined from '@ant-design/icons-svg/es/asn/DollarOutlined';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useOpenPushPermissionGate } from '@/features/notifications/push-permission-gate';
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
import { AgendaPanel } from './components/AgendaPanel';
import { OverviewHeader } from './components/OverviewHeader';
import {
  FleetPlanPanel,
  OwnerVehiclesPanel,
  ReputationPanel,
  WalletPanel,
} from './components/SidePanels';
import { TodayFocus } from './components/TodayFocus';
import { TrendCard } from './components/TrendPanels';
import {
  useDashboardLinks,
  useDashboardRefresh,
  useDashboardMoney,
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
  const tApp = useTranslations('Dashboard.partnerApp');
  const tCommon = useTranslations('Common.labels');
  const tStates = useTranslations('Common.states');
  const fmt = useAppFormat();
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

  const { branchId, filter: branchFilter } = useScreenBranchFilter();
  const overview = usePartnerOverview(branchId);
  const money = useDashboardMoney(branchId);
  const links = useDashboardLinks(branchId);
  const refresh = useDashboardRefresh();
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

  /*
   * App Partner: KPI tháng ĐÚNG bốn ô của Figma (doanh thu · đơn mới · chuyến hoàn thành · tỷ lệ lấp
   * đầy) - bỏ ô "Tiền cọc đang giữ" (người dùng chốt 20/11/2026).
   */

  const trend = data?.trend ?? null;

  const goReport = useCallback(
    () => navigateOnce(withBranchParam(ROUTES.manage.finance(), branchId)),
    [navigateOnce, branchId],
  );
  const report = useMemo(
    () => (money.visible ? { label: tApp('report'), onPress: goReport } : undefined),
    [money.visible, tApp, goReport],
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

  /*
   * Figma Overview MB (24175:52345) - CHỈ những gì bản vẽ có (người dùng chốt 20/11/2026): đầu màn
   * riêng (lời chào + chat + chuông, không thanh trên/ngày), phạm vi chi nhánh · bốn ô việc · ví · lịch
   * giao nhận · (tuyến hoa hồng) xe của bạn · KPI tháng · thu chi / đơn & chuyến · đội xe · uy tín.
   * Đã bỏ: câu trả lời đầu trang, thẻ ba bước mở gian hàng, ô tiền cọc, hàng "Xe sẵn sàng", dải
   * thông báo của thanh trên chung.
   */
  return (
    <Screen padded={false} refreshing={refresh.refreshing} onRefresh={refresh.onRefresh}>
      <OverviewHeader />
      {/* Đáy: đã chừa sẵn chiều cao thanh tab (`Screen`) - chỉ thêm 8 (feedback 20/11/2026: thừa). */}
      <YStack px={gutter} pt={HEADER_GAP} gap={PAGE_GAP} pb={space.sm}>
        <BranchFilterField filter={branchFilter} value={branchId} scope />
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

        <TrendCard
          series={money.visible ? money.series : null}
          bySource={money.visible ? money.bySource : null}
          branchId={branchId}
          trips={tripsState}
        />

        {/*
          App Partner: Tổng quan CHỈ hiện đội xe - thông tin gói nằm ở Thông tin gian hàng (sau cờ
          `isPlanPromotionEnabled`), người dùng chốt 13/11/2026. Không có hàng "Xe sẵn sàng" (chốt
          20/11/2026 theo Figma).
        */}
        <FleetPlanPanel
          showPlan={false}
          showMarket={showMarket}
          market={data?.market ?? undefined}
          fleet={null}
          links={links}
        />
        <ReputationPanel metrics={data?.reputation} />
      </YStack>
    </Screen>
  );
}

/** Figma: nội dung cách đầu màn 24 (y 135 → 159). */
const HEADER_GAP = 24;
/** Figma Overview MB: các khối cách 16. */
const PAGE_GAP = 16;
