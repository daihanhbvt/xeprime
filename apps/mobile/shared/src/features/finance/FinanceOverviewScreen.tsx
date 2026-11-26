import { useCallback, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  PERMISSION,
  RECEIPT_TYPE,
  type FinanceGranularity,
} from '@xeprime/types';
import { buildPeriodRange, isZeroMoney } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Card } from '@/components/ui/Card';
import { CompactSelect } from '@/components/ui/SelectTrigger';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { BranchFilterField } from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import { CategoryBreakdown } from './components/CategoryBreakdown';
import { CustomerRevenueList } from './components/CustomerRevenueList';
import { FinanceOverviewCards } from './components/FinanceOverviewCards';
import { FinancePeriodBar } from './components/FinancePeriodBar';
import { ShopTaxWithheldCard } from '@/features/tax/components/ShopTaxWithheldCard';
import { REVENUE_TREND_PLOT_HEIGHT, RevenueTrendChart } from './components/RevenueTrendChart';
import { useBucketLabels } from './hooks/use-bucket-labels';
import { VehicleProfitList } from './components/VehicleProfitList';
import {
  FINANCE_PERFORMANCE_VIEW,
  FINANCE_PERFORMANCE_VIEW_VALUES,
  type FinancePerformanceView,
} from './constants';
import {
  FINANCE_OVERVIEW_DEFAULT_PERIOD,
  FINANCE_OVERVIEW_PERIOD_VALUES,
} from './constants';
import {
  useCustomerRevenue,
  useFinanceByCategory,
  useFinanceSeries,
  useFinanceSummary,
  useVehicleProfit,
} from './hooks/use-finance';

/** Figma "Hiệu suất kinh doanh": chỉ TOP 5 của mỗi tab (người dùng chốt 25/11/2026). */
const PERFORMANCE_TOP = 5;
/** Figma `24228:98979`: ô độ mịn "Tuần" rộng 100. */
const GRANULARITY_SELECT_WIDTH = 100;
/** Figma: khoảng 12 giữa các phần trong thẻ và giữa hai ô lọc. */
const CARD_GAP = 12;

/**
 * Tổng quan tài chính (FIN-01) — bản native của `/manage/finance`.
 *
 * Chín khối, đúng thứ tự web: tiêu đề · kỳ dựng sẵn · khoảng ngày · ba lớp số liệu · biểu đồ xu
 * hướng · cơ cấu thu · cơ cấu chi · hiệu quả theo xe · doanh thu theo khách.
 *
 * Kỳ sống ở state màn hình chứ không ở URL: app native không có URL để chia sẻ (ADR 0004). Giá
 * trị khởi tạo là THÁNG NÀY — một biểu đồ không có biên là một biểu đồ không vẽ được, và "toàn
 * bộ lịch sử" cũng không phải câu ai hỏi khi mở màn tiền buổi sáng.
 *
 * Hai dải xếp hạng phân trang ĐỘC LẬP: dùng chung một số trang thì bấm sang trang ở dải này sẽ
 * kéo luôn dải kia.
 */
export function FinanceOverviewScreen() {
  const colors = useColors();
  const t = useTranslations('Finance.overview');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();

  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);

  const [range, setRange] = useState(() => buildPeriodRange(FINANCE_OVERVIEW_DEFAULT_PERIOD));
  const [granularity, setGranularity] = useState<FinanceGranularity>(FINANCE_GRANULARITY.DAY);
  /*
   * Tab của khối "Hiệu suất kinh doanh" (web `BusinessPerformanceCard`, PR #276): theo xe hoặc theo
   * khách. Chỉ bảng của tab đang mở được gọi — tab kia không tốn một lượt truy vấn.
   */
  const [perf, setPerf] = useState<FinancePerformanceView>(FINANCE_PERFORMANCE_VIEW.VEHICLES);

  /*
   * Ô "Chi nhánh" (ADR 0052) — mọi khối của màn theo CÙNG chi nhánh. Phần chung không gắn xe được
   * nói ra ở thẻ chi phí và dưới hai dải xếp hạng (`unassignedCost`/`unassignedRevenue`).
   */
  const { branchId, filter: branchFilter } = useScreenBranchFilter(() => undefined);
  const branchScope = useMemo(() => (branchId ? { branchId } : {}), [branchId]);

  const period = useMemo(
    () => ({ ...range, ...branchScope, granularity }),
    [range, branchScope, granularity],
  );

  /**
   * Bộ lọc của hai dải TOP: trang đầu, sắp xếp mặc định của server (xe theo lợi nhuận, khách theo
   * doanh thu). Tiền tố `customer*` chỉ sống ở tầng giao diện - `customerRevenueParams` hoá nó
   * thành `page`/`limit` lúc gửi; chung một object để hai dải không đọc trúng cache của nhau.
   */
  const rankingFilters = useMemo(
    () => ({
      ...range,
      ...branchScope,
      page: FIRST_PAGE,
      limit: PERFORMANCE_TOP,
      customerPage: FIRST_PAGE,
      customerLimit: PERFORMANCE_TOP,
    }),
    [range, branchScope],
  );

  const summary = useFinanceSummary(period, undefined, canViewFinance);
  const series = useFinanceSeries(period, undefined, canViewFinance);
  const income = useFinanceByCategory(period, RECEIPT_TYPE.INCOME, undefined, canViewFinance);
  const expense = useFinanceByCategory(period, RECEIPT_TYPE.EXPENSE, undefined, canViewFinance);
  const vehicles = useVehicleProfit(
    rankingFilters,
    canViewFinance && perf === FINANCE_PERFORMANCE_VIEW.VEHICLES,
  );
  const customers = useCustomerRevenue(
    rankingFilters,
    canViewFinance && perf === FINANCE_PERFORMANCE_VIEW.CUSTOMERS,
  );

  const granularityOptions = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: t(`chart.every.${value}`) })),
    [t],
  );

  /*
   * Nhãn cột theo ĐỘ MỊN THẬT mà server đã dùng, không theo thứ client xin: kỳ dài bị server hạ
   * xuống `month` mà nhãn vẫn in ngày thì mỗi cột nói dối về khoảng nó đại diện.
   */
  const actualGranularity = (series.data?.granularity ?? granularity) as FinanceGranularity;
  const { labelOf, titleOf } = useBucketLabels(actualGranularity);

  /**
   * Kéo-làm-mới nạp lại CẢ MÀN, không riêng thẻ tổng.
   *
   * Màn này là sáu truy vấn độc lập; refetch mỗi `summary` thì ba lớp số nhảy sang giá trị mới
   * trong khi biểu đồ, hai khối cơ cấu và hai dải xếp hạng ngay dưới nó vẫn là số của lần tải
   * trước — đúng cái màn hình lệch mà thao tác làm mới sinh ra để dọn.
   */
  const refreshAll = useCallback(() => {
    void summary.refetch();
    void series.refetch();
    void income.refetch();
    void expense.refetch();
    void vehicles.refetch();
    void customers.refetch();
  }, [summary, series, income, expense, vehicles, customers]);

  const changeRange = useCallback((next: { from: string; to: string }) => setRange(next), []);

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái thiếu quyền, KHÔNG giả thành rỗng,
  // và KHÔNG phát một request tài chính nào.
  if (!permissions.isLoading && !canViewFinance) {
    return (
      <>
        <ManagePageHeader title={t('page.title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
            // Web: lối thoát "Về trang chủ" của trang thiếu quyền.
            actionLabel={t('forbidden.home')}
            onAction={() => navigateOnce(ROUTES.manage.home())}
          />
        </Screen>
      </>
    );
  }

  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((bucket) => isZeroMoney(bucket.revenue) && isZeroMoney(bucket.cost));

  return (
    <>
      {/* Chuẩn màn Đơn thuê: tiêu đề ở thanh trang, câu mô tả đứng đầu thân. */}
      <ManagePageHeader title={t('page.title')} />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={
          summary.isRefetching ||
          series.isRefetching ||
          income.isRefetching ||
          expense.isRefetching ||
          vehicles.isRefetching ||
          customers.isRefetching
        }
        onRefresh={refreshAll}
      >
        <YStack gap={layout.section}>
          {/* Figma `24228:98931`: ô Chi nhánh + ô kỳ "01/11 - 30/11" chia đôi một hàng (khoảng 12). */}
          <XStack gap={CARD_GAP}>
            {branchFilter.visible ? (
              <YStack f={1} minWidth={0}>
                <BranchFilterField filter={branchFilter} value={branchId} select />
              </YStack>
            ) : null}
            <YStack f={1} minWidth={0}>
              <FinancePeriodBar
                compact
                periods={FINANCE_OVERVIEW_PERIOD_VALUES}
                from={range.from}
                to={range.to}
                onChange={changeRange}
              />
            </YStack>
          </XStack>

          <FinanceOverviewCards
            data={summary.data}
            filters={period}
            loading={summary.isFetching}
            error={summary.isError}
          />

          {/* Biểu đồ - Figma `24228:98976`: tiêu đề + ô độ mịn "Tuần" (rộng 100) cùng một hàng. */}
          <Card lift="flat">
            <YStack gap={CARD_GAP}>
              <XStack ai="center" gap={space.md}>
                <YStack f={1} minWidth={0}>
                  <SectionHeader>{t('chart.titleShort')}</SectionHeader>
                </YStack>
                <YStack w={GRANULARITY_SELECT_WIDTH}>
                  <CompactSelect
                    title={t('chart.every.label')}
                    // Web tô theo độ mịn SERVER thật dùng (kỳ dài bị hạ về Tháng).
                    value={actualGranularity}
                    options={granularityOptions}
                    onChange={setGranularity}
                  />
                </YStack>
              </XStack>

              {series.isError && !series.data ? (
                <ScreenError
                  error={series.error}
                  title={t('chart.error')}
                  onRetry={() => void series.refetch()}
                />
              ) : series.isLoading && !series.data ? (
                <SkeletonText lines={5} />
              ) : seriesEmpty || !series.data || series.data.buckets.length === 0 ? (
                <ScreenMessage
                  icon="stats-chart-outline"
                  title={t('chart.empty')}
                  description={t('chart.emptyHint')}
                />
              ) : (
                <RevenueTrendChart
                  buckets={series.data.buckets}
                  labelOf={labelOf}
                  titleOf={titleOf}
                  yAxis="million"
                  plotHeight={REVENUE_TREND_PLOT_HEIGHT.financeOverview}
                />
              )}
            </YStack>
          </Card>

          {/* Figma `24228:99092`: cơ cấu thu và cơ cấu chi chung MỘT thẻ, ngăn bằng một vạch. */}
          <Card lift="flat">
            <YStack gap={CARD_GAP}>
              <CategoryBreakdown
                title={t('categories.incomeTitle')}
                type={RECEIPT_TYPE.INCOME}
                tone="revenue"
                data={income.data}
                filters={period}
                loading={income.isFetching}
                error={income.isError}
              />
              <YStack h={1} bg={colors.border} />
              <CategoryBreakdown
                title={t('categories.expenseTitle')}
                type={RECEIPT_TYPE.EXPENSE}
                tone="cost"
                data={expense.data}
                filters={period}
                loading={expense.isFetching}
                error={expense.isError}
              />
            </YStack>
          </Card>

          {/*
            "Hiệu suất kinh doanh" - Figma `24228:99117`: tiêu đề + "Top 5 theo ..." mờ bên phải, tab
            gạch chân Theo xe / Theo khách (đổi KHỐI, không lọc cùng danh sách), rồi top 5 của tab.
          */}
          <Card lift="flat">
            <YStack gap={CARD_GAP}>
              <XStack ai="center" gap={space.sm}>
                <YStack f={1} minWidth={0}>
                  <SectionHeader>{t('performance.title')}</SectionHeader>
                </YStack>
                <Text
                  col={colors.textPlaceholder}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.regular}
                  numberOfLines={1}
                >
                  {perf === FINANCE_PERFORMANCE_VIEW.VEHICLES
                    ? t('performance.top.vehicles', { count: PERFORMANCE_TOP })
                    : t('performance.top.customers', { count: PERFORMANCE_TOP })}
                </Text>
              </XStack>
              <YStack accessibilityLabel={t('performance.tabs.label')}>
                <UnderlineTabs
                  stretch
                  items={FINANCE_PERFORMANCE_VIEW_VALUES.map((value) => ({
                    key: value,
                    label: t(`performance.tabs.${value}`),
                  }))}
                  value={perf}
                  onChange={setPerf}
                />
              </YStack>

              {perf === FINANCE_PERFORMANCE_VIEW.VEHICLES ? (
                <VehicleProfitList
                  items={vehicles.data?.items ?? []}
                  loading={vehicles.isFetching}
                  /* Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ dải đang đọc. */
                  error={
                    vehicles.isError && !vehicles.data
                      ? { error: vehicles.error, onRetry: () => void vehicles.refetch() }
                      : null
                  }
                />
              ) : (
                <CustomerRevenueList
                  items={customers.data?.items ?? []}
                  loading={customers.isFetching}
                  error={
                    customers.isError && !customers.data
                      ? { error: customers.error, onRetry: () => void customers.refetch() }
                      : null
                  }
                />
              )}
            </YStack>
          </Card>

          {/*
            Thuế đã khấu trừ trong kỳ (Phase 8 — ADR 0032 điều 3). Đứng ở sổ tài chính vì nó là một
            dòng làm GIẢM tiền chủ xe thực nhận, nên nó thuộc cùng câu hỏi với doanh thu và chi phí.
          */}
          <ShopTaxWithheldCard />
        </YStack>
      </Screen>
    </>
  );
}
