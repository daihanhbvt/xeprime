import type { UseQueryResult } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { HorizontalScroller } from '@/components/ui/HorizontalScroller';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DASHBOARD_TREND_MONTHS } from '@xeprime/types';
import { isZeroMoney, sumMoney } from '@xeprime/domain';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { SegmentedTabs, type SegmentedTabItem } from '@/components/ui/SegmentedTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { chartValue } from '@/features/finance/components/revenue-trend-layout';
import type { FinanceSeries, FinanceSourceBreakdown } from '@/features/finance/api';
import {
  RevenueSourceSegment,
  RevenueSourceTrack,
  sourceGroupColor,
} from '@/features/finance/components/RevenueSource';
import {
  REVENUE_SOURCE_VIEW,
  sharePercent,
  tripsOf,
  type RevenueSourceView,
  type SourceGroup,
} from '@/features/finance/vehicle-finance';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { Pressable } from 'react-native';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import {
  DASHBOARD_REVENUE_DAYS,
  dashboardRevenueSeriesFilters,
  type PartnerTrendPoint,
} from '../api';

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
  bySource = null,
  branchId,
  trips,
}: {
  series: UseQueryResult<FinanceSeries> | null;
  /** Doanh thu theo nguồn đơn (ADR 0110) cùng 30 ngày - đi cùng `series`, `null` khi không có tab tiền. */
  bySource?: UseQueryResult<FinanceSourceBreakdown> | null;
  /** Chi nhánh đang lọc - lối sang Tổng quan doanh thu mang theo (web `withBranch`). */
  branchId?: string | undefined;
  trips: TripsTrendState | null;
}) {
  const t = useTranslations('Dashboard.charts');
  const colors = useColors();
  const [picked, setPicked] = useState<TrendTab>('revenue');
  const hasRevenue = series !== null;
  const hasTrips = trips !== null;
  const tabs = useMemo<SegmentedTabItem<TrendTab>[]>(() => {
    const list: SegmentedTabItem<TrendTab>[] = [];
    // Feedback 20/11/2026: "Thu chi 30 ngày" vừa chữ, "Đơn & chuyến 6 tháng" lấy phần còn lại - không cắt "…".
    if (hasRevenue) list.push({ key: 'revenue', label: t('revenueTab', { days: DASHBOARD_REVENUE_DAYS }), hug: true });
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
        <SegmentedTabs items={tabs} value={active} onChange={setPicked} variant="neutral" fit />
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
      {active === 'revenue' && series ? <RevenueTab series={series} bySource={bySource} branchId={branchId} /> : null}
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
  /** Ba phần doanh thu theo nguồn của đợt (web `parts`) - cột chồng. */
  parts: Record<SourceGroup, string>;
}

/** Thứ tự các phần trong cột chồng, từ chân lên (web `STACK_GROUPS`). */
const STACK_GROUPS: readonly SourceGroup[] = ['marketplace', 'direct', 'unlinked'];

/**
 * Tab thu chi - Figma: ba ô Doanh thu (nền vàng rất nhạt) · Chi phí (nền xám) · Lợi nhuận (nền xanh,
 * số xanh), cộng trên ĐÚNG chuỗi 30 ngày đã tải; rồi biểu đồ cột doanh thu gộp theo đợt liên tiếp
 * (5 cột như khung Figma), nhãn giá trị rút gọn trên đầu cột và ngày bắt đầu đợt dưới chân.
 */
function RevenueTab({
  series,
  bySource,
  branchId,
}: {
  series: UseQueryResult<FinanceSeries>;
  bySource: UseQueryResult<FinanceSourceBreakdown> | null;
  branchId?: string | undefined;
}) {
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
      list.push({
        key: head.bucket,
        label: fmt.dayMonth(head.bucket),
        revenue,
        title: fmt.moneyCompact(revenue),
        parts: {
          marketplace: sumMoney(chunk.map((b) => b.marketplaceRevenue)),
          direct: sumMoney(chunk.map((b) => b.directRevenue)),
          unlinked: sumMoney(chunk.map((b) => b.unlinkedRevenue)),
        },
      });
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
        {bySource ? <SourceSplit query={bySource} branchId={branchId} /> : null}
        <RevenueBars groups={groups} />
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
            {/* Cột CHỒNG theo nguồn đơn (ADR 0110, web `barStack`) - tổng chiều cao vẫn là doanh thu. */}
            <YStack
              w="100%"
              h={Math.round((Math.max(0, chartValue(group.revenue)) / max) * BAR_MAX)}
              borderTopLeftRadius={radius.control}
              borderTopRightRadius={radius.control}
              ov="hidden"
              jc="flex-end"
            >
              {(() => {
                const partsTotal = STACK_GROUPS.reduce(
                  (sum, g) => sum + Math.max(0, chartValue(group.parts[g])),
                  0,
                );
                // Không có phần nào (dữ liệu cũ) - giữ một khối màu thương hiệu như trước.
                if (partsTotal <= 0) return <YStack f={1} bg={colors.brandShape} />;
                return [...STACK_GROUPS].reverse().map((g) => {
                  const value = Math.max(0, chartValue(group.parts[g]));
                  if (value === 0) return null;
                  return (
                    <YStack key={g} f={value / partsTotal} bg={sourceGroupColor(colors, g)} />
                  );
                });
              })()}
            </YStack>
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

/**
 * Tab đơn & chuyến - như web `TripsCard` (người dùng chốt 20/11/2026): chú giải kèm TỔNG sáu tháng
 * ở trên, rồi biểu đồ cột ĐÔI theo tháng vẽ tay như `RevenueBars` - số trên đầu cột, tháng dưới
 * chân, cuộn ngang khi số quá dài. App không có dòng mô tả dưới tiêu đề, không chạm-để-xem.
 */
function TripsTab({ trend, loading, isError, onRetry }: TripsTrendState) {
  const t = useTranslations('Dashboard.charts');
  const colors = useColors();
  const fmt = useAppFormat();
  const empty =
    trend !== undefined && trend.every((p) => p.newBookings === 0 && p.completedTrips === 0);
  const totals = useMemo(
    () => ({
      newBookings: (trend ?? []).reduce((sum, p) => sum + p.newBookings, 0),
      completedTrips: (trend ?? []).reduce((sum, p) => sum + p.completedTrips, 0),
    }),
    [trend],
  );

  return (
    <TabState
      loading={!trend && loading}
      error={!trend && isError ? { title: t('tripsError'), onRetry } : null}
      empty={empty ? { title: t('tripsEmpty', { months: DASHBOARD_TREND_MONTHS }) } : null}
    >
      <YStack gap={TAB_GAP}>
        {/* Chú giải kèm TỔNG mỗi chuỗi, đứng TRÊN biểu đồ - như web `TripsCard` (Figma `24138:80517`). */}
        <XStack flexWrap="wrap" columnGap={LEGEND_GAP_X} rowGap={LEGEND_GAP_Y}>
          <Legend
            color={colors.brandShape}
            label={t('legendTotal', { label: t('newBookings'), count: fmt.count(totals.newBookings) })}
          />
          <Legend
            color={colors.success}
            label={t('legendTotal', { label: t('completedTrips'), count: fmt.count(totals.completedTrips) })}
          />
        </XStack>
        {trend ? <TripBars trend={trend} /> : null}
      </YStack>
    </TabState>
  );
}

/** Neo GIỮA tháng, giữa ngày (UTC) để `period` YYYY-MM không lệch tháng ở bất kỳ múi giờ nào. */
const monthAnchor = (period: string) => new Date(`${period}-15T12:00:00Z`);

/**
 * Cột đôi theo tháng - cùng khung với `RevenueBars` (vùng cột kẻ đáy, đệm ngang 8, bo đỉnh, nhãn
 * 12/18 dưới chân); mỗi tháng hai cột sát nhau: Đơn mới (`shape/primary`) · Chuyến hoàn thành (xanh).
 * Số trên đầu cột 10/14 cho vừa cột hẹp (sáu tháng × hai cột).
 */
const TripBars = memo(function TripBars({ trend }: { trend: readonly PartnerTrendPoint[] }) {
  const colors = useColors();
  const fmt = useAppFormat();
  const max = Math.max(1, ...trend.flatMap((p) => [p.newBookings, p.completedTrips]));
  const height = (value: number) => Math.round((Math.max(0, value) / max) * TRIP_BAR_MAX);
  /*
   * Bề rộng tối thiểu của một tháng tính theo số DÀI nhất sẽ in trên cột: số nhỏ thì sáu tháng chia
   * đều bề ngang, không cuộn; số lớn (vd. "12.040") thì mỗi tháng giữ đủ chỗ và cả biểu đồ CUỘN NGANG
   * thay vì để số chồng lên nhau / bị cắt.
   */
  const longest = Math.max(...trend.flatMap((p) => [fmt.count(p.newBookings).length, fmt.count(p.completedTrips).length]));
  const groupMin = 2 * Math.max(TRIP_BAR_MIN, longest * CAPTION_CHAR_WIDTH) + TRIP_PAIR_GAP;
  return (
    <HorizontalScroller contentContainerStyle={SCROLL_FILL} hintTop={TRIP_BAR_AREA / 2 - 16}>
      <YStack f={1}>
        <XStack
          ai="flex-end"
          gap={TRIP_GROUP_GAP}
          px={BAR_PAD_X}
          h={TRIP_BAR_AREA}
          borderBottomWidth={1}
          borderBottomColor={colors.surfaceMuted}
        >
          {trend.map((point) => (
            <XStack
              key={point.period}
              f={1}
              minWidth={groupMin}
              ai="flex-end"
              gap={TRIP_PAIR_GAP}
              accessible
              accessibilityLabel={`${fmt.monthYear(monthAnchor(point.period))}: ${fmt.count(point.newBookings)} · ${fmt.count(point.completedTrips)}`}
            >
              <TripBar value={point.newBookings} height={height(point.newBookings)} color={colors.brandShape} />
              <TripBar value={point.completedTrips} height={height(point.completedTrips)} color={colors.success} />
            </XStack>
          ))}
        </XStack>
        <XStack gap={TRIP_GROUP_GAP} px={BAR_PAD_X} pt={AXIS_PAD_TOP}>
          {trend.map((point) => (
            <Text
              key={point.period}
              f={1}
              minWidth={groupMin}
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              ta="center"
              numberOfLines={1}
            >
              {fmt.monthYearShort(monthAnchor(point.period))}
            </Text>
          ))}
        </XStack>
      </YStack>
    </HorizontalScroller>
  );
});

function TripBar({ value, height, color }: { value: number; height: number; color: string }) {
  const colors = useColors();
  const fmt = useAppFormat();
  return (
    <YStack f={1} minWidth={0} ai="center" gap={BAR_LABEL_GAP}>
      <Text
        col={colors.textMuted}
        fos={typeScale.caption.fontSize}
        lh={typeScale.caption.lineHeight}
        fow={fontWeight.medium}
        ta="center"
        numberOfLines={1}
        // Tháng không có đơn/chuyến thì KHÔNG ghi "0" (feedback 20/11/2026) - giữ chỗ dòng để các
        // cột còn lại không lệch hàng.
        opacity={value > 0 ? 1 : 0}
        accessibilityElementsHidden={value <= 0}
      >
        {fmt.count(value)}
      </Text>
      <YStack
        w="100%"
        h={height}
        bg={color}
        borderTopLeftRadius={TRIP_BAR_RADIUS}
        borderTopRightRadius={TRIP_BAR_RADIUS}
      />
    </YStack>
  );
}

/** Vùng cột = nhãn số 14 + khoảng 4 + cột ≤145 + kẻ đáy; tháng cách 8, hai cột trong tháng cách 2. */
const TRIP_BAR_AREA = 164;
const TRIP_BAR_MAX = 145;
const TRIP_GROUP_GAP = 8;
const TRIP_PAIR_GAP = 2;
const TRIP_BAR_RADIUS = 6;
/** Cột hẹp nhất (số 1-2 chữ số) và bề rộng ước lượng một ký tự của số 10px - đủ dư cho dấu chấm nghìn. */
const TRIP_BAR_MIN = 14;
const CAPTION_CHAR_WIDTH = 6.5;
/** Nội dung ngắn hơn khung thì giãn đủ bề ngang (không cuộn); dài hơn thì cuộn. */
const SCROLL_FILL = { flexGrow: 1 } as const;
/** Web `.legend`: `gap 8px 32px`; ô màu vuông 10, bo 2; chữ 14/20 màu phụ. */
const LEGEND_GAP_X = 32;
const LEGEND_GAP_Y = 8;
const LEGEND_DOT = 10;
const LEGEND_DOT_RADIUS = 2;

/** Ô màu + nhãn - chú giải cột (web `TripsCard` `.legendItem`). */
function Legend({ color, label }: { color: string; label: string }) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={6}>
      <YStack w={LEGEND_DOT} h={LEGEND_DOT} br={LEGEND_DOT_RADIUS} bg={color} />
      <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {label}
      </Text>
    </XStack>
  );
}

/**
 * Tỷ trọng doanh thu theo nguồn của 30 ngày — native port of web `SourceSplit`: thanh tỷ trọng rồi
 * từng dòng (chấm màu · tên · số chuyến · tiền · %), chạm một dòng mở Tổng quan doanh thu ở góc nhìn
 * đó. Kỳ chưa có doanh thu thì khối tự vắng.
 */
function SourceSplit({
  query,
  branchId,
}: {
  query: UseQueryResult<FinanceSourceBreakdown>;
  branchId?: string | undefined;
}) {
  const t = useTranslations('Dashboard.charts.sources');
  const tSource = useTranslations('Finance.bySource.chart');
  const colors = useColors();
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const data = query.data;
  // Tổng quan doanh thu đúng 30 ngày của thẻ + chi nhánh, mở sẵn một góc nhìn nguồn (web `detailHref`).
  const openFinance = (view: RevenueSourceView | null) => {
    const { from, to } = dashboardRevenueSeriesFilters();
    navigateOnce(
      ROUTES.manage.finance({
        revenueSource: view,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(branchId ? { branchId } : {}),
      }),
    );
  };

  if (query.isPending) return <Skeleton height={48} />;
  if (!data) {
    return query.isError ? (
      <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
        {t('error')}
      </Text>
    ) : null;
  }
  if (isZeroMoney(data.total)) return null;

  const rows: {
    group: SourceGroup;
    view: RevenueSourceView | null;
    amount: string;
    trips: number | null;
  }[] = [
    {
      group: 'marketplace',
      view: REVENUE_SOURCE_VIEW.MARKETPLACE,
      amount: data.marketplaceAmount,
      trips: tripsOf(data.items, REVENUE_SOURCE_VIEW.MARKETPLACE),
    },
    {
      group: 'direct',
      view: REVENUE_SOURCE_VIEW.DIRECT,
      amount: data.directAmount,
      trips: tripsOf(data.items, REVENUE_SOURCE_VIEW.DIRECT),
    },
    // Thu không gắn đơn: chỉ hiện khi có, không có chuyến, mở màn ở góc nhìn mọi nguồn.
    ...(isZeroMoney(data.unlinkedAmount)
      ? []
      : [{ group: 'unlinked' as const, view: null, amount: data.unlinkedAmount, trips: null }]),
  ];

  return (
    <YStack gap={8}>
      <XStack ai="center" jc="space-between" gap={8}>
        <Text col={colors.text} fos={typeScale.body.fontSize} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => openFinance(null)}
        >
          <Text col={colors.brandLink} fos={typeScale.label.fontSize} fow={fontWeight.medium}>
            {t('detail')}
          </Text>
        </Pressable>
      </XStack>
      <RevenueSourceTrack>
        {rows.map((row) => (
          <RevenueSourceSegment
            key={row.group}
            share={sharePercent(row.amount, data.total)}
            group={row.group}
          />
        ))}
      </RevenueSourceTrack>
      <YStack accessibilityLabel={t('legend')}>
        {rows.map((row) => (
          <Pressable
            key={row.group}
            accessibilityRole="link"
            onPress={() => openFinance(row.view)}
          >
            <XStack ai="center" jc="space-between" gap={8} py={4}>
              <XStack ai="center" gap={6} f={1} minWidth={0}>
                <YStack w={8} h={8} br={radius.pill} bg={sourceGroupColor(colors, row.group)} />
                <Text flexShrink={1} col={colors.text} fos={typeScale.label.fontSize} numberOfLines={1}>
                  {tSource(row.group)}
                </Text>
                {row.trips !== null ? (
                  <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
                    {t('trips', { count: row.trips })}
                  </Text>
                ) : null}
              </XStack>
              <Text col={colors.text} fos={typeScale.label.fontSize} fow={fontWeight.medium}>
                {fmt.money(row.amount)}
                <Text col={colors.textMuted} fow={fontWeight.regular}>
                  {` ${t('share', { percent: sharePercent(row.amount, data.total) })}`}
                </Text>
              </Text>
            </XStack>
          </Pressable>
        ))}
      </YStack>
    </YStack>
  );
}
