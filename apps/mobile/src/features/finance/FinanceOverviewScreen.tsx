import { useCallback, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  PERMISSION,
  RECEIPT_TYPE,
  type FinanceGranularity,
} from '@xeprime/types';
import { buildPeriodRange, isZeroMoney } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Chip } from '@/components/ui/Chip';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { CategoryBreakdown } from './components/CategoryBreakdown';
import { CustomerRevenueList } from './components/CustomerRevenueList';
import { FinanceOverviewCards } from './components/FinanceOverviewCards';
import { FinancePeriodBar } from './components/FinancePeriodBar';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import { useBucketLabels } from './hooks/use-bucket-labels';
import { VehicleProfitList } from './components/VehicleProfitList';
import {
  FINANCE_OVERVIEW_DEFAULT_PERIOD,
  FINANCE_OVERVIEW_PERIOD_VALUES,
  VEHICLE_PROFIT_PAGE_SIZE,
} from './constants';
import {
  useCustomerRevenue,
  useFinanceByCategory,
  useFinanceSeries,
  useFinanceSummary,
  useVehicleProfit,
} from './hooks/use-finance';

const EMPTY_META = { page: FIRST_PAGE, limit: VEHICLE_PROFIT_PAGE_SIZE, total: 0, hasNext: false };

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
  const t = useTranslations('Finance.overview');
  const permissions = usePermissions();

  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);

  const [range, setRange] = useState(() => buildPeriodRange(FINANCE_OVERVIEW_DEFAULT_PERIOD));
  const [granularity, setGranularity] = useState<FinanceGranularity>(FINANCE_GRANULARITY.DAY);
  const [vehicleSort, setVehicleSort] = useState<string | undefined>(undefined);
  const [vehiclePage, setVehiclePage] = useState(FIRST_PAGE);
  const [customerSort, setCustomerSort] = useState<string | undefined>(undefined);
  const [customerPage, setCustomerPage] = useState(FIRST_PAGE);

  const period = useMemo(() => ({ ...range, granularity }), [range, granularity]);

  /**
   * Bộ lọc của hai dải xếp hạng.
   *
   * Tiền tố `customer*` chỉ tồn tại ở tầng giao diện — `customerRevenueParams` hoá nó thành
   * `sort`/`page` lúc gửi. Giữ chúng trong CÙNG một object để hai dải không đọc trúng cache
   * của nhau.
   */
  const rankingFilters = useMemo(
    () => ({
      ...range,
      ...(vehicleSort ? { sort: vehicleSort } : {}),
      page: vehiclePage,
      limit: VEHICLE_PROFIT_PAGE_SIZE,
      ...(customerSort ? { customerSort } : {}),
      customerPage,
      customerLimit: VEHICLE_PROFIT_PAGE_SIZE,
    }),
    [range, vehicleSort, vehiclePage, customerSort, customerPage],
  );

  const summary = useFinanceSummary(period, undefined, canViewFinance);
  const series = useFinanceSeries(period, undefined, canViewFinance);
  const income = useFinanceByCategory(period, RECEIPT_TYPE.INCOME, undefined, canViewFinance);
  const expense = useFinanceByCategory(period, RECEIPT_TYPE.EXPENSE, undefined, canViewFinance);
  const vehicles = useVehicleProfit(rankingFilters, canViewFinance);
  const customers = useCustomerRevenue(rankingFilters, canViewFinance);

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

  const changeRange = useCallback((next: { from: string; to: string }) => {
    setRange(next);
    // Đổi kỳ là đổi tập dữ liệu của cả hai dải — trang 7 của kỳ cũ gần như chắc chắn không tồn tại.
    setVehiclePage(FIRST_PAGE);
    setCustomerPage(FIRST_PAGE);
  }, []);

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái thiếu quyền, KHÔNG giả thành rỗng,
  // và KHÔNG phát một request tài chính nào.
  if (!permissions.isLoading && !canViewFinance) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
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
      <ManageHeader />
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
          <YStack gap={2}>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
              {t('page.title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('page.subtitle')}
            </Text>
          </YStack>

          <FinancePeriodBar
            periods={FINANCE_OVERVIEW_PERIOD_VALUES}
            from={range.from}
            to={range.to}
            onChange={changeRange}
          />

          <FinanceOverviewCards
            data={summary.data}
            filters={period}
            loading={summary.isFetching}
            error={summary.isError}
          />

          {/* ── Biểu đồ xu hướng ─────────────────────────────────────────── */}
          <YStack gap={space.sm}>
            <BlockTitle>{t('chart.title')}</BlockTitle>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('chart.description')}
            </Text>

            {/* Ba tab của web, giữ nguyên hình thái "một cú bấm là đổi". */}
            <XStack gap={space.xs} flexWrap="wrap" accessibilityLabel={t('chart.every.label')}>
              {granularityOptions.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={granularity === option.value}
                  size="sm"
                  onPress={() => setGranularity(option.value)}
                />
              ))}
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
              />
            )}
          </YStack>

          <CategoryBreakdown
            title={t('categories.incomeTitle')}
            type={RECEIPT_TYPE.INCOME}
            tone="revenue"
            data={income.data}
            filters={period}
            loading={income.isFetching}
            error={income.isError}
          />
          <CategoryBreakdown
            title={t('categories.expenseTitle')}
            type={RECEIPT_TYPE.EXPENSE}
            tone="cost"
            data={expense.data}
            filters={period}
            loading={expense.isFetching}
            error={expense.isError}
          />

          <VehicleProfitList
            items={vehicles.data?.items ?? []}
            meta={vehicles.data?.meta ?? EMPTY_META}
            sort={vehicleSort}
            unassignedCost={summary.data?.unassignedCost}
            loading={vehicles.isFetching}
            /* Chỉ coi là lỗi khi KHÔNG còn dữ liệu cũ — refetch nền hỏng thì giữ dải đang đọc. */
            error={
              vehicles.isError && !vehicles.data
                ? { error: vehicles.error, onRetry: () => void vehicles.refetch() }
                : null
            }
            onSortChange={(next) => {
              setVehicleSort(next);
              setVehiclePage(FIRST_PAGE);
            }}
            onPageChange={setVehiclePage}
          />

          <CustomerRevenueList
            items={customers.data?.items ?? []}
            meta={customers.data?.meta ?? EMPTY_META}
            sort={customerSort}
            unassignedRevenue={summary.data?.unassignedRevenue}
            loading={customers.isFetching}
            error={
              customers.isError && !customers.data
                ? { error: customers.error, onRetry: () => void customers.refetch() }
                : null
            }
            onSortChange={(next) => {
              setCustomerSort(next);
              setCustomerPage(FIRST_PAGE);
            }}
            onPageChange={setCustomerPage}
          />
        </YStack>
      </Screen>
    </>
  );
}
