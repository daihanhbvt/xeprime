import type { UseQueryResult } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { BarChart, type barDataItem } from 'react-native-gifted-charts';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DASHBOARD_TREND_MONTHS } from '@xeprime/types';
import { isZeroMoney, sumMoney } from '@xeprime/domain';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { chartValue } from '@/features/finance/components/revenue-trend-layout';
import type { FinanceSeries } from '@/features/finance/api';
import { useAppFormat } from '@/i18n/use-app-format';
import { useChartColors, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, typeScale } from '@/theme/tokens';
import { DASHBOARD_REVENUE_DAYS, type PartnerTrendPoint } from '../api';

type TrendTab = 'revenue' | 'trips';

export interface TripsTrendState {
  trend: readonly PartnerTrendPoint[] | undefined;
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * Thẻ XU HƯỚNG của Tổng quan — Figma "Nhóm thông tin" `24175:52485`: một thẻ, hai tab phân đoạn
 * "Thu chi 30 ngày" | "Đơn & chuyến 6 tháng". Mỗi tab giữ ĐÚNG luật hiện của khối cũ:
 *
 *  - `revenue` (sổ thu chi `/finance/series` theo ngày) chỉ khi gói có tính năng tiền + vai có
 *    `finance.view` - nơi gọi truyền `null` khi không;
 *  - `trips` (`trend` của `/dashboard/overview`) chỉ khi server trả `trend` khác `null`, hoặc lần
 *    tải đầu lỗi (chưa biết tuyến có `trend` không - vẫn hiện lỗi + thử lại).
 *
 * Chỉ một tab hiện thì không vẽ hàng tab mà hiện tên tab làm tiêu đề. Không tab nào ⇒ không thẻ.
 */
export function TrendCard({
  series,
  trips,
}: {
  series: UseQueryResult<FinanceSeries> | null;
  trips: TripsTrendState | null;
}) {
  const t = useTranslations('Dashboard.charts');
  const colors = useColors();
  const [picked, setPicked] = useState<TrendTab>('revenue');
  const hasRevenue = series !== null;
  const hasTrips = trips !== null;
  const tabs = useMemo<SegmentedTabItem<TrendTab>[]>(() => {
    const list: SegmentedTabItem<TrendTab>[] = [];
    if (hasRevenue) list.push({ key: 'revenue', label: t('revenueTab', { days: DASHBOARD_REVENUE_DAYS }) });
    if (hasTrips) list.push({ key: 'trips', label: t('tripsTab', { months: DASHBOARD_TREND_MONTHS }) });
    return list;
  }, [hasRevenue, hasTrips, t]);

  const first = tabs[0];
  if (!first) return null;
  /* Tab đã chọn biến mất (mất quyền giữa chừng) thì rơi về tab còn lại. */
  const active: TrendTab = tabs.some((tab) => tab.key === picked) ? picked : first.key;
  const activeLabel = tabs.find((tab) => tab.key === active)?.label ?? first.label;

  return (
    <InfoGroupCard accessibilityLabel={activeLabel}>
      {tabs.length > 1 ? (
        <SegmentedTabs items={tabs} value={active} onChange={setPicked} variant="neutral" />
      ) : (
        <Text
          col={colors.text}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
          accessibilityRole="header"
        >
          {first.label}
        </Text>
      )}
      {active === 'revenue' && series ? <RevenueTab series={series} /> : null}
      {active === 'trips' && trips ? <TripsTab {...trips} /> : null}
    </InfoGroupCard>
  );
}

/** Thân tab: lỗi / đang tải / rỗng là trạng thái của CHÍNH tab. */
function TabState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: { title: string; onRetry: () => void } | null;
  empty: { title: string; description?: string } | null;
  children: ReactNode;
}) {
  if (error) return <EmptyState variant="error" title={error.title} onRetry={error.onRetry} />;
  if (loading) return <Skeleton height={SKELETON_HEIGHT} />;
  if (empty) {
    return (
      <EmptyState
        variant="empty"
        title={empty.title}
        {...(empty.description ? { description: empty.description } : {})}
      />
    );
  }
  return <>{children}</>;
}

const SKELETON_HEIGHT = 220;

interface RevenueGroup {
  key: string;
  label: string;
  revenue: string;
  title: string;
}

/**
 * Tab thu chi - Figma: ba ô Doanh thu (nền vàng rất nhạt) · Chi phí (nền xám) · Lợi nhuận (nền xanh,
 * số xanh), cộng trên ĐÚNG chuỗi 30 ngày đã tải; rồi biểu đồ cột doanh thu gộp theo đợt liên tiếp
 * (5 cột như khung Figma), nhãn giá trị rút gọn trên đầu cột và ngày bắt đầu đợt dưới chân.
 */
function RevenueTab({ series }: { series: UseQueryResult<FinanceSeries> }) {
  const t = useTranslations('Dashboard.charts');
  const colors = useColors();
  const fmt = useAppFormat();
  const buckets = useMemo(() => series.data?.buckets ?? [], [series.data]);
  const empty =
    series.data !== undefined && buckets.every((b) => isZeroMoney(b.revenue) && isZeroMoney(b.cost));

  const totals = useMemo(
    () => ({
      revenue: sumMoney(buckets.map((b) => b.revenue)),
      cost: sumMoney(buckets.map((b) => b.cost)),
      profit: sumMoney(buckets.map((b) => b.profit)),
    }),
    [buckets],
  );

  const groups = useMemo<RevenueGroup[]>(() => {
    const size = Math.max(1, Math.ceil(buckets.length / REVENUE_BARS));
    const list: RevenueGroup[] = [];
    for (let i = 0; i < buckets.length; i += size) {
      const chunk = buckets.slice(i, i + size);
      const head = chunk[0];
      if (!head) continue;
      const revenue = sumMoney(chunk.map((b) => b.revenue));
      list.push({ key: head.bucket, label: fmt.dayMonth(head.bucket), revenue, title: fmt.moneyCompact(revenue) });
    }
    return list;
  }, [buckets, fmt]);

  const { refetch } = series;
  const retry = useCallback(() => void refetch(), [refetch]);

  return (
    <TabState
      loading={series.isPending}
      error={series.isError && !series.data ? { title: t('revenueError'), onRetry: retry } : null}
      empty={
        empty
          ? { title: t('revenueEmpty', { days: DASHBOARD_REVENUE_DAYS }), description: t('revenueEmptyHint') }
          : null
      }
    >
      <YStack gap={TAB_GAP}>
        <XStack gap={METRIC_GAP}>
          <MoneyTile label={t('revenue')} value={fmt.money(totals.revenue)} bg={colors.warningWash} fg={colors.text} />
          <MoneyTile label={t('cost')} value={fmt.money(totals.cost)} bg={colors.background} fg={colors.text} />
          <MoneyTile label={t('profit')} value={fmt.money(totals.profit)} bg={colors.successSurface} fg={colors.success} />
        </XStack>
        <RevenueBars groups={groups} />
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t('revenueDescription')}
        </Text>
      </YStack>
    </TabState>
  );
}

/** Figma: hàng tab ↔ ô số `gap 12`, ba ô cách 8, năm cột. */
const TAB_GAP = 12;
const METRIC_GAP = 8;
const REVENUE_BARS = 5;

/** Figma "Thông số": `px 8 · py 6 · gap 4`, bo 12; nhãn 12/18, số 14/20 đậm vừa. */
const MoneyTile = memo(function MoneyTile({
  label,
  value,
  bg,
  fg,
}: {
  label: string;
  value: string;
  bg: string;
  fg: string;
}) {
  const colors = useColors();
  return (
    <YStack
      f={1}
      minWidth={0}
      px={TILE_PAD_X}
      py={TILE_PAD_Y}
      gap={TILE_GAP}
      br={radius.control}
      bg={bg}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={fg}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.semibold}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={MIN_FONT_SCALE}
      >
        {value}
      </Text>
    </YStack>
  );
});

const TILE_PAD_X = 8;
const TILE_PAD_Y = 6;
const TILE_GAP = 4;
/** Số tiền dài (9 chữ số) co lại thay vì cắt "…" trong ô rộng một phần ba. */
const MIN_FONT_SCALE = 0.7;

/**
 * Cột doanh thu - Figma "Monthly Earnings Chart": vùng cột kẻ đáy 1 `stroke/gray-100`, đệm ngang 8,
 * cột cách 12, cao tối đa 145, bo đỉnh 12, màu `shape/primary`; nhãn giá trị 12/18 đậm vừa trên
 * đầu cột, nhãn ngày 12/18 mờ dưới chân (đệm trên 6).
 */
const RevenueBars = memo(function RevenueBars({ groups }: { groups: readonly RevenueGroup[] }) {
  const colors = useColors();
  const max = Math.max(1, ...groups.map((group) => chartValue(group.revenue)));
  return (
    <YStack>
      <XStack
        ai="flex-end"
        gap={REV_BAR_GAP}
        px={BAR_PAD_X}
        h={BAR_AREA}
        borderBottomWidth={1}
        borderBottomColor={colors.surfaceMuted}
      >
        {groups.map((group) => (
          <YStack
            key={group.key}
            f={1}
            minWidth={0}
            ai="center"
            gap={BAR_LABEL_GAP}
            accessible
            accessibilityLabel={`${group.label}: ${group.title}`}
          >
            <Text
              col={colors.textMuted}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              ta="center"
              numberOfLines={1}
            >
              {group.title}
            </Text>
            <YStack
              w="100%"
              h={Math.round((Math.max(0, chartValue(group.revenue)) / max) * BAR_MAX)}
              bg={colors.brandShape}
              borderTopLeftRadius={radius.control}
              borderTopRightRadius={radius.control}
            />
          </YStack>
        ))}
      </XStack>
      <XStack gap={REV_BAR_GAP} px={BAR_PAD_X} pt={AXIS_PAD_TOP}>
        {groups.map((group) => (
          <Text
            key={group.key}
            f={1}
            minWidth={0}
            col={colors.placeholder}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            ta="center"
            numberOfLines={1}
          >
            {group.label}
          </Text>
        ))}
      </XStack>
    </YStack>
  );
});

/** Figma: vùng cột cao 168 (nhãn 18 + khoảng 4 + cột ≤145 + kẻ đáy), cột cách 12, đệm ngang 8. */
const BAR_AREA = 168;
const BAR_MAX = 145;
const REV_BAR_GAP = 12;
const BAR_PAD_X = 8;
const BAR_LABEL_GAP = 4;
const AXIS_PAD_TOP = 6;

/** Tab đơn & chuyến - biểu đồ cột đôi theo tháng của web `CountTrendChart`, giữ nguyên. */
function TripsTab({ trend, loading, isError, onRetry }: TripsTrendState) {
  const t = useTranslations('Dashboard.charts');
  const colors = useColors();
  const empty =
    trend !== undefined && trend.every((p) => p.newBookings === 0 && p.completedTrips === 0);

  return (
    <TabState
      loading={!trend && loading}
      error={!trend && isError ? { title: t('tripsError'), onRetry } : null}
      empty={empty ? { title: t('tripsEmpty', { months: DASHBOARD_TREND_MONTHS }) } : null}
    >
      <YStack gap={TAB_GAP}>
        {trend ? <CountTrendChart trend={trend} /> : null}
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t('tripsDescription')}
        </Text>
      </YStack>
    </TabState>
  );
}

/** Neo GIỮA tháng, giữa ngày (UTC) để `period` YYYY-MM không lệch tháng ở bất kỳ múi giờ nào. */
const monthAnchor = (period: string) => new Date(`${period}-15T12:00:00Z`);

/** Web `CountTrendChart`: tổng `height 240` (vùng vẽ 200 + trục + chú thích), `maxBarSize 28`, `barGap 2`, `YAxis width 36`, `CHART_BAR_RADIUS 4`. */
const PLOT_HEIGHT = 200;
const MAX_BAR = 28;
const BAR_GAP = 2;
const Y_AXIS_WIDTH = 36;
const BAR_RADIUS = 4;
const SECTIONS = 4;
const LEGEND_DOT = 8;
const PLOT_MARGIN_RIGHT = 8;
const LABEL_END_PAD = 16;

function CountTrendChart({ trend }: { trend: readonly PartnerTrendPoint[] }) {
  const colors = useColors();
  const chart = useChartColors();
  const t = useTranslations('Dashboard.charts');
  const tChart = useTranslations('Finance.overview.chart');
  const fmt = useAppFormat();
  const [width, setWidth] = useState(0);
  // Mốc đang xem - bản native của tooltip Recharts (web rê chuột; app CHẠM để xem, chạm lại để đóng).
  const [selected, setSelected] = useState<string | null>(null);
  const active = trend.find((p) => p.period === selected) ?? null;

  const max = Math.max(1, ...trend.flatMap((p) => [p.newBookings, p.completedTrips]));
  const step = Math.max(1, Math.ceil(max / SECTIONS));
  // Web `margin.right = 8`: chừa mép phải để nhãn tháng cuối không bị cắt.
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH - PLOT_MARGIN_RIGHT);
  // Nhóm cột chia đều phần còn lại sau đệm cuối - đệm đó chứa nửa nhãn tháng cuối.
  const groupWidth = trend.length > 0 ? (plotWidth - LABEL_END_PAD) / trend.length : 0;
  const barWidth = Math.max(4, Math.min(MAX_BAR, (groupWidth * 0.6 - BAR_GAP) / 2));
  const groupGap = Math.max(0, groupWidth - barWidth * 2 - BAR_GAP);

  const bars: barDataItem[] = trend.flatMap((point) => [
    {
      value: point.newBookings,
      frontColor: chart.series1,
      spacing: BAR_GAP,
      /*
       * Web vẽ `monthYear` dài rồi để Recharts BỎ BỚT nhãn khi chật (`minTickGap`). Thư viện native
       * không bỏ được - nhãn bị cắt "Thá…" - nên giữ đủ sáu mốc ở dạng ngắn `MM/YYYY`, mỗi nhãn
       * rộng bằng CẢ nhóm cột và căn giữa nhóm.
       */
      label: fmt.monthYearShort(monthAnchor(point.period)),
      labelWidth: groupWidth,
      labelTextStyle: {
        color: chart.axis,
        fontSize: fontSize.label,
        textAlign: 'center',
        marginLeft: -(groupWidth - (barWidth * 2 + BAR_GAP)) / 2,
      },
    },
    { value: point.completedTrips, frontColor: chart.series2, spacing: groupGap },
  ]);

  return (
    <YStack gap={8} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <YStack>
        <BarChart
          data={bars}
          width={plotWidth}
          height={PLOT_HEIGHT}
          barWidth={barWidth}
          initialSpacing={groupGap / 2}
          endSpacing={LABEL_END_PAD}
          disableScroll
          isAnimated={false}
          animationDuration={0}
          barBorderTopLeftRadius={BAR_RADIUS}
          barBorderTopRightRadius={BAR_RADIUS}
          maxValue={step * SECTIONS}
          stepValue={step}
          noOfSections={SECTIONS}
          yAxisLabelWidth={Y_AXIS_WIDTH}
          yAxisThickness={0}
          xAxisThickness={0}
          yAxisTextStyle={{ color: chart.axis, fontSize: fontSize.label }}
          rulesType="dashed"
          dashWidth={3}
          dashGap={3}
          rulesColor={chart.grid}
        />
        {/* Lớp CHẠM: mỗi tháng một dải phủ trọn chiều cao vùng vẽ, đặt đúng nhóm cột của tháng. */}
        <YStack pos="absolute" top={0} height={PLOT_HEIGHT} left={Y_AXIS_WIDTH} width={plotWidth}>
          {trend.map((point, index) => (
            <Pressable
              key={point.period}
              onPress={() => setSelected((cur) => (cur === point.period ? null : point.period))}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: groupGap / 2 + index * groupWidth - groupGap / 2,
                width: groupWidth,
              }}
              accessibilityRole="button"
              accessibilityLabel={fmt.monthYear(monthAnchor(point.period))}
              accessibilityState={{ selected: point.period === selected }}
            />
          ))}
        </YStack>
        </YStack>
      ) : null}
      <XStack jc="center" gap={16}>
        <Legend color={chart.series1} label={t('newBookings')} />
        <Legend color={chart.series2} label={t('completedTrips')} />
      </XStack>
      {active ? (
        <YStack bg={colors.surface} br={radius.md} bw={1} bc={colors.border} p={8} pt={12} gap={4}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {fmt.monthYear(monthAnchor(active.period))}
          </Text>
          <TooltipRow color={chart.series1} label={t('newBookings')} value={fmt.count(active.newBookings)} />
          <TooltipRow color={chart.series2} label={t('completedTrips')} value={fmt.count(active.completedTrips)} />
        </YStack>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tChart('tapHint')}
        </Text>
      )}
    </YStack>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={6}>
      <YStack w={LEGEND_DOT} h={LEGEND_DOT} br={radius.pill} bg={color} />
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
    </XStack>
  );
}

/** Một dòng của thẻ chi tiết - chấm màu nối với cột, chữ giữ màu mực, số căn phải (như `ChartTooltip` web). */
function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={4}>
      <YStack w={LEGEND_DOT} h={LEGEND_DOT} br={radius.pill} bg={color} />
      <Text f={1} col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
        {value}
      </Text>
    </XStack>
  );
}
