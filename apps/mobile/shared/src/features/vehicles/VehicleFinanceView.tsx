import { memo, useMemo, useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DAY_PARAM_FORMAT,
  buildPeriodRange,
  isNegativeMoney,
  isPositiveMoney,
  isZeroMoney,
  moneyChangePercent,
  moneyPerPart,
  moneyPercentOf,
  nowInAppTz,
  subtractMoney,
  sumMoney,
  toAppTz,
  type PeriodKey,
} from '@xeprime/domain';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  RECEIPT_TYPE,
  VEHICLE_SOURCE_TYPE,
  type FinanceGranularity,
  type VehicleSourceType,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { InfoHint } from '@/components/ui/InfoHint';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { CategoryBreakdown } from '@/features/finance/components/CategoryBreakdown';
import { RevenueSourceCards, RevenueSourceRowsBlock } from '@/features/finance/components/RevenueSource';
import {
  REVENUE_TREND_PLOT_HEIGHT,
  RevenueTrendChart,
} from '@/features/finance/components/RevenueTrendChart';
import { FINANCE_OVERVIEW_PERIOD_VALUES } from '@/features/finance/constants';
import { useBucketLabels } from '@/features/finance/hooks/use-bucket-labels';
import {
  useFinanceByCategory,
  useFinanceBySource,
  useFinanceSeries,
  useFinanceSummary,
} from '@/features/finance/hooks/use-finance';
import type {
  FinancePeriodFilters,
  FinanceScope,
  FinanceSourceBreakdown,
  FinanceSummary,
} from '@/features/finance/api';
import {
  REVENUE_SOURCE_VIEW,
  comparablePreviousRange,
  countDueDates,
  revenueOf,
  sharePercent,
  tripsOf,
  type RevenueSourceView,
} from '@/features/finance/vehicle-finance';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { VehicleDetail, VehicleSource } from './api';
import { useVehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { useVehicleSource } from './hooks/use-vehicle';

type PeriodOption = (typeof FINANCE_OVERVIEW_PERIOD_VALUES)[number];

/** Kỳ "Toàn bộ" - web `ALL_TIME`: không gửi `from`/`to`, mọi endpoint báo cáo hiểu là toàn thời gian. */
const ALL_TIME = 'all_time';
type PeriodChoice = PeriodOption | typeof ALL_TIME;

/** Độ mịn mặc định khi chọn một kỳ - web `PERIOD_GRANULARITY`. */
const PERIOD_GRANULARITY: Record<PeriodOption, FinanceGranularity> = {
  today: FINANCE_GRANULARITY.DAY,
  this_week: FINANCE_GRANULARITY.DAY,
  this_month: FINANCE_GRANULARITY.DAY,
  last_month: FINANCE_GRANULARITY.DAY,
  this_quarter: FINANCE_GRANULARITY.WEEK,
  this_year: FINANCE_GRANULARITY.MONTH,
};

const DEFAULT_PERIOD: PeriodOption = 'this_month';
const TILE_PAD = 12;
const TILE_RADIUS = 10;

/**
 * Tài chính của MỘT xe — native port of web `VehicleFinanceTab` (#344/#345, ADR 0110 · 0111): "chiếc xe
 * này kiếm được bao nhiêu, từ đâu, tốn bao nhiêu, có tự nuôi được nguồn vốn của nó không". Mọi con số
 * đến từ CÙNG bộ endpoint của Tổng quan doanh thu, thu hẹp bằng `vehicleId`.
 *
 * Chọn nguồn CHỈ đổi phần doanh thu (ô Doanh thu, số chuyến, TB/chuyến, phần được nhấn trên biểu đồ,
 * danh sách nguồn). Chi phí và lợi nhuận luôn là của CẢ XE.
 *
 * App (người dùng chốt 27/11/2026): một màn riêng mở từ chi tiết xe. "Tạo phiếu thu/chi" / "Xem sổ
 * Thu-Chi" không có ở đây - đã gỡ khỏi khối tiền của hồ sơ trên app (người dùng chốt 26/11/2026).
 */
export function VehicleFinanceView({
  vehicle,
  showCapital,
}: {
  vehicle: VehicleDetail;
  /** Thẻ "Nghĩa vụ nguồn xe" - sổ nguồn xe là của gian hàng tuyến gói (web `showCapital={isManage}`). */
  showCapital: boolean;
}) {
  const t = useTranslations('Finance.vehicle');
  const tEntity = useTranslations('Finance.entity');
  const colors = useColors();
  const scope = useMemo<FinanceScope>(() => ({ vehicleId: vehicle.id }), [vehicle.id]);

  const [period, setPeriod] = useState<PeriodChoice>(DEFAULT_PERIOD);
  const [granularity, setGranularity] = useState<FinanceGranularity>(
    PERIOD_GRANULARITY[DEFAULT_PERIOD],
  );
  const [view, setView] = useState<RevenueSourceView | null>(null);
  const allTime = period === ALL_TIME;
  const filters = useMemo<FinancePeriodFilters>(
    () => ({
      granularity,
      ...(allTime ? {} : buildPeriodRange(period as PeriodKey)),
    }),
    [allTime, period, granularity],
  );

  const today = useMemo(() => nowInAppTz().format(DAY_PARAM_FORMAT), []);
  // Toàn bộ thời gian không có "cùng kỳ trước" để so.
  const previousRange = allTime ? null : comparablePreviousRange(filters.from, filters.to, today);

  const summary = useFinanceSummary(filters, scope);
  const series = useFinanceSeries(filters, scope);
  const bySource = useFinanceBySource(filters, scope);
  const costs = useFinanceByCategory(filters, RECEIPT_TYPE.EXPENSE, scope);
  const previous = useFinanceBySource(
    { ...filters, ...(previousRange ?? {}) },
    scope,
    previousRange !== null,
  );

  /*
   * Đổi kỳ thì đổi luôn độ mịn cho HỢP kỳ (người dùng vẫn đổi tay được) - web `choosePeriod`.
   */
  const choosePeriod = (next: PeriodChoice) => {
    setPeriod(next);
    setGranularity(next === ALL_TIME ? FINANCE_GRANULARITY.MONTH : PERIOD_GRANULARITY[next]);
  };

  const actualGranularity = (series.data?.granularity ?? granularity) as FinanceGranularity;
  const { labelOf, titleOf } = useBucketLabels(actualGranularity);
  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((b) => isZeroMoney(b.revenue) && isZeroMoney(b.cost));

  const periodItems = useMemo(
    () => [
      ...FINANCE_OVERVIEW_PERIOD_VALUES.map((value) => ({
        value: value as PeriodChoice,
        label: tEntity(`periods.${value}`),
      })),
      { value: ALL_TIME as PeriodChoice, label: t('allTime') },
    ],
    [t, tEntity],
  );
  const granularityItems = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ key: value, label: tEntity(`every.${value}`) })),
    [tEntity],
  );

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
          <YStack gap={space.xs}>
            <SectionHeader>{t('title')}</SectionHeader>
            <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('subtitle')}
            </Text>
          </YStack>
          <ChipTabs
            label={tEntity('periods.label')}
            items={periodItems}
            value={period}
            onSelect={choosePeriod}
            gutter={0}
          />
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
              {tEntity('every.label')}
            </Text>
            <SegmentedTabs
              items={granularityItems}
              value={actualGranularity}
              onChange={setGranularity}
              variant="neutral"
            />
          </YStack>

          <RevenueSourceCards
            data={bySource.data}
            loading={bySource.isFetching && !bySource.data}
            error={bySource.isError && !bySource.data}
            onRetry={() => void bySource.refetch()}
            view={view}
            onChange={setView}
          />

          {summary.isError && !summary.data ? (
            <ScreenError error={summary.error} title={tEntity('error')} onRetry={() => void summary.refetch()} />
          ) : (
            <KpiTiles
              summary={summary.data}
              summaryLoading={summary.isFetching && !summary.data}
              bySource={bySource.data}
              sourceLoading={bySource.isFetching && !bySource.data}
              compare={!allTime}
              previous={previousRange ? previous.data : null}
              previousLoading={previousRange !== null && previous.isFetching && !previous.data}
              costCount={costs.data?.items.reduce((sum, item) => sum + item.count, 0) ?? null}
              view={view}
            />
          )}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <SectionHeader>{tEntity('chartTitle')}</SectionHeader>
          <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
            {t('chart.description')}
          </Text>
          {series.isError && !series.data ? (
            <ScreenError error={series.error} title={tEntity('chartError')} onRetry={() => void series.refetch()} />
          ) : series.isLoading && !series.data ? (
            <SkeletonText lines={5} />
          ) : seriesEmpty || !series.data || series.data.buckets.length === 0 ? (
            <ScreenMessage
              compact
              icon="stats-chart-outline"
              title={tEntity('chartEmpty')}
              description={tEntity('chartEmptyHint')}
            />
          ) : (
            <RevenueTrendChart
              buckets={series.data.buckets}
              labelOf={labelOf}
              titleOf={titleOf}
              plotHeight={REVENUE_TREND_PLOT_HEIGHT.entity}
              sources={{
                highlight:
                  view === REVENUE_SOURCE_VIEW.MARKETPLACE
                    ? 'marketplace'
                    : view === REVENUE_SOURCE_VIEW.DIRECT
                      ? 'direct'
                      : null,
              }}
            />
          )}
        </YStack>
      </Card>

      <Card>
        <RevenueSourceRowsBlock
          data={bySource.data}
          loading={bySource.isFetching && !bySource.data}
          error={bySource.isError && !bySource.data}
          onRetry={() => void bySource.refetch()}
          view={view}
        />
      </Card>

      <Card>
        <CategoryBreakdown
          title={t('costTitle')}
          type={RECEIPT_TYPE.EXPENSE}
          tone="cost"
          data={costs.data}
          filters={filters}
          scope={scope}
          loading={costs.isFetching && !costs.data}
          error={costs.isError && !costs.data}
        />
      </Card>

      {showCapital ? (
        <VehicleCapitalCard
          vehicle={vehicle}
          filters={filters}
          allTime={allTime}
          revenue={summary.data?.revenue ?? null}
          profit={summary.data?.profit ?? null}
          moneyLoading={summary.isFetching && !summary.data}
        />
      ) : null}
    </YStack>
  );
}

/* ─── Bốn ô số ─────────────────────────────────────────────────────────────── */

const KpiTiles = memo(function KpiTiles({
  summary,
  summaryLoading,
  bySource,
  sourceLoading,
  compare,
  previous,
  previousLoading,
  costCount,
  view,
}: {
  summary: FinanceSummary | undefined;
  summaryLoading: boolean;
  bySource: FinanceSourceBreakdown | undefined;
  sourceLoading: boolean;
  /** Có "cùng kỳ trước" để so không - kỳ "Toàn bộ" thì không. */
  compare: boolean;
  /** `null` = không có kỳ để so; `undefined` = chưa tải xong. */
  previous: FinanceSourceBreakdown | null | undefined;
  previousLoading: boolean;
  costCount: number | null;
  view: RevenueSourceView | null;
}) {
  const t = useTranslations('Finance.vehicle.kpi');
  const tEntity = useTranslations('Finance.entity');
  const tChange = useTranslations('Dashboard.change');
  const colors = useColors();
  const fmt = useAppFormat();

  const revenue = bySource ? revenueOf(bySource, view) : null;
  const trips = bySource ? tripsOf(bySource.items, view) : null;
  const average = revenue !== null && trips ? moneyPerPart(revenue, trips) : null;
  const change =
    revenue !== null && previous ? moneyChangePercent(revenue, revenueOf(previous, view)) : null;
  const changeText =
    change === null
      ? t('changeNone')
      : `${change > 0 ? tChange('up', { value: Math.abs(change) }) : change < 0 ? tChange('down', { value: Math.abs(change) }) : tChange('flat')} ${t('changeSuffix')}`;
  const changeColor =
    change === null || change === 0 ? colors.textMuted : change > 0 ? colors.success : colors.danger;

  return (
    <XStack flexWrap="wrap" gap={space.sm}>
      <KpiTile
        label={t(`revenue.${view ?? 'all'}`)}
        info={{ label: t('revenueInfoLabel'), content: t('revenueInfo') }}
        value={revenue !== null ? fmt.money(revenue) : null}
        tone={colors.success}
        loading={sourceLoading}
        hints={
          bySource
            ? [
                ...(!compare || previousLoading
                  ? []
                  : [{ text: changeText, color: changeColor }]),
                {
                  text:
                    trips && average
                      ? t('revenueHint', { count: trips, avg: fmt.money(average) })
                      : t('revenueHintNoTrips'),
                },
              ]
            : []
        }
      />
      <KpiTile
        label={t('cost')}
        info={{ label: t('costInfoLabel'), content: t('costInfo') }}
        value={summary ? fmt.money(summary.cost) : null}
        tone={colors.danger}
        loading={summaryLoading}
        hints={costCount !== null ? [{ text: t('costHint', { count: costCount }) }] : []}
      />
      <KpiTile
        label={t('profit')}
        info={{ label: t('profitInfoLabel'), content: t('profitInfo') }}
        value={summary ? fmt.money(summary.profit) : null}
        tone={isNegativeMoney(summary?.profit) ? colors.danger : colors.text}
        loading={summaryLoading}
        hints={
          summary
            ? [
                {
                  text:
                    summary.profitMarginPercent == null
                      ? tEntity('marginUnknown')
                      : tEntity('margin', { value: summary.profitMarginPercent }),
                },
              ]
            : []
        }
      />
      <KpiTile
        label={t('debt')}
        info={{ label: t('debtInfoLabel'), content: t('debtInfo') }}
        value={summary ? fmt.money(summary.totalDebt) : null}
        tone={summary && !isZeroMoney(summary.totalDebt) ? colors.danger : colors.text}
        loading={summaryLoading}
        hints={
          summary
            ? [
                {
                  text: t('debtHint', {
                    count: summary.debtBookings,
                    deposit: fmt.money(summary.depositHeld),
                  }),
                },
              ]
            : []
        }
      />
    </XStack>
  );
});

function KpiTile({
  label,
  info,
  value,
  tone,
  loading,
  hints,
}: {
  label: string;
  info: { label: string; content: string };
  value: string | null;
  tone: string;
  loading: boolean;
  hints: { text: string; color?: string }[];
}) {
  const colors = useColors();
  return (
    <YStack w="48.5%" flexGrow={1} gap={2} p={TILE_PAD} br={TILE_RADIUS} bg={colors.background}>
      <XStack ai="center" gap={space.xs}>
        <Text flexShrink={1} col={colors.placeholder} fos={typeScale.label.fontSize} numberOfLines={1}>
          {label}
        </Text>
        <InfoHint label={info.label} content={info.content} size={typeScale.label.fontSize} />
      </XStack>
      {loading ? (
        <SkeletonText lines={1} />
      ) : (
        <Text
          col={tone}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {value ?? '-'}
        </Text>
      )}
      {hints.map((hint) => (
        <Text key={hint.text} col={hint.color ?? colors.placeholder} fos={typeScale.label.fontSize}>
          {hint.text}
        </Text>
      ))}
    </YStack>
  );
}

/* ─── Nghĩa vụ nguồn xe ────────────────────────────────────────────────────── */

type Detail = NonNullable<VehicleSource['detail']>;

interface CapitalLine {
  key: string;
  label: ReactNode;
  value: string | null;
  tone?: 'gain' | 'loss' | 'warn';
}

/** Ngày lịch VN (`YYYY-MM-DD`) của một mốc server trả (ngày trần hoặc ISO đầy đủ) - web `dayKeyOf`. */
function dayKeyOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toAppTz(value).format(DAY_PARAM_FORMAT);
}

/**
 * "Nghĩa vụ nguồn xe" — native port of web `VehicleCapitalCard`: chiếc xe này đã tự nuôi được nguồn
 * vốn của nó trong kỳ chưa. Trả góp / thuê lại: số phải đóng trong kỳ = khoản mỗi tháng × số NGÀY
 * ĐÓNG TIỀN rơi vào kỳ (chỉ các kỳ đã tới hạn tính tới hôm nay); hợp tác: phần chia ƯỚC TÍNH; sở
 * hữu: giá mua + lợi nhuận kỳ trên giá mua. Không bịa số: ô nào hồ sơ chưa khai thì không dựng.
 */
function VehicleCapitalCard({
  vehicle,
  filters,
  allTime,
  revenue,
  profit,
  moneyLoading,
}: {
  vehicle: VehicleDetail;
  filters: FinancePeriodFilters;
  allTime: boolean;
  revenue: string | null;
  profit: string | null;
  moneyLoading: boolean;
}) {
  const t = useTranslations('Finance.vehicle.capital');
  const colors = useColors();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const can = useVehicleCapabilities();
  const enabled = can.source;
  const source = useVehicleSource(vehicle.id, enabled);
  const detail = source.data?.detail ?? null;
  const sourceType = (source.data?.sourceType ??
    vehicle.sourceType ??
    VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;

  if (!enabled) return null;

  const profitLabel = allTime ? t('profitAll') : t('profit');

  const pushInstalment = (
    out: CapitalLine[],
    d: Detail,
    monthly: string | null | undefined,
    kind: 'financed' | 'rented',
  ) => {
    if (!monthly) return;
    out.push({
      key: 'monthly',
      label: d.paymentDay ? t(`${kind}.monthlyDay`, { day: d.paymentDay }) : t(`${kind}.monthly`),
      value: fmt.money(monthly),
    });
    // Chỉ các kỳ đóng ĐÃ TỚI HẠN tính tới hôm nay - lợi nhuận kỳ đang chạy cũng mới tới hôm nay.
    const today = nowInAppTz().format(DAY_PARAM_FORMAT);
    // "Toàn bộ": đếm từ đầu hợp đồng, rồi ngày mua, rồi ngày xe vào hệ thống.
    const from = filters.from ?? dayKeyOf(d.startDate ?? d.purchaseDate ?? vehicle.createdAt);
    const to = filters.to && filters.to < today ? filters.to : today;
    const count = countDueDates({
      from,
      to,
      paymentDay: d.paymentDay,
      startDate: d.startDate,
      endDate: d.endDate,
      termMonths: d.termMonths,
    });
    if (count === null) {
      out.push({ key: 'needsDay', label: t('needsDay'), value: null });
      return;
    }
    const due = sumMoney(Array.from({ length: count }, () => monthly));
    out.push({ key: 'due', label: t(`${kind}.due`, { count }), value: fmt.money(due) });
    if (profit === null) return;
    out.push({ key: 'profit', label: profitLabel, value: fmt.money(profit), tone: 'gain' });
    const net = subtractMoney(profit, due);
    out.push({
      key: 'net',
      label: t(`${kind}.net`),
      value: fmt.money(net),
      tone: isNegativeMoney(net) ? 'loss' : 'gain',
    });
  };

  const buildLines = (d: Detail): CapitalLine[] => {
    const out: CapitalLine[] = [];
    switch (sourceType) {
      case VEHICLE_SOURCE_TYPE.FINANCED:
        if (d.bankName) out.push({ key: 'bank', label: t('financed.bank'), value: d.bankName });
        pushInstalment(out, d, d.monthlyTotal, 'financed');
        break;
      case VEHICLE_SOURCE_TYPE.RENTED:
        if (d.ownerName) out.push({ key: 'owner', label: t('rented.owner'), value: d.ownerName });
        pushInstalment(out, d, d.monthlyRent, 'rented');
        break;
      case VEHICLE_SOURCE_TYPE.PARTNERSHIP: {
        if (d.commissionPercent) {
          out.push({
            key: 'owner',
            label: d.ownerName
              ? t('partnership.ownerNamed', { name: d.ownerName })
              : t('partnership.owner'),
            value: t('partnership.ownerPercent', { percent: Number(d.commissionPercent) }),
          });
          const ownerShare = moneyPercentOf(revenue, d.commissionPercent);
          if (ownerShare !== null && revenue !== null) {
            out.push({
              key: 'ownerShare',
              label: (
                <XStack ai="center" gap={space.xs} flexShrink={1}>
                  <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
                    {t('partnership.ownerShare')}
                  </Text>
                  <InfoHint label={t('partnership.infoLabel')} content={t('partnership.info')} />
                </XStack>
              ),
              value: fmt.money(ownerShare),
              tone: 'warn',
            });
            const shopShare = subtractMoney(revenue, ownerShare);
            out.push({
              key: 'shopShare',
              label: t('partnership.shopShare', {
                percent: Math.max(0, 100 - Number(d.commissionPercent)),
              }),
              value: fmt.money(shopShare),
              tone: isNegativeMoney(shopShare) ? 'loss' : 'gain',
            });
          }
        }
        break;
      }
      default: {
        if (d.purchaseDate) {
          out.push({ key: 'date', label: t('owned.purchaseDate'), value: fmt.date(d.purchaseDate) });
        }
        if (d.purchasePrice) {
          out.push({ key: 'price', label: t('owned.purchasePrice'), value: fmt.money(d.purchasePrice) });
        }
        out.push({ key: 'none', label: t('owned.noObligation'), value: null });
        if (profit !== null) out.push({ key: 'profit', label: profitLabel, value: fmt.money(profit) });
        if (profit !== null && isPositiveMoney(d.purchasePrice)) {
          const roi = sharePercent(profit, d.purchasePrice as string);
          out.push({
            key: 'roi',
            label: t('owned.roi'),
            value: t('owned.roiValue', { percent: roi }),
            tone: roi < 0 ? 'loss' : 'gain',
          });
        } else {
          out.push({ key: 'noPrice', label: t('owned.noPrice'), value: null });
        }
      }
    }
    return out;
  };

  const lines = detail ? buildLines(detail) : [];
  const toneColor = (tone: CapitalLine['tone']) =>
    tone === 'gain'
      ? colors.success
      : tone === 'loss'
        ? colors.danger
        : tone === 'warn'
          ? colors.warning
          : colors.text;

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <XStack ai="center" gap={space.sm} f={1} minWidth={0} flexWrap="wrap">
            <SectionHeader>{t('title')}</SectionHeader>
            <YStack px={space.sm} py={2} br={radius.pill} bg={colors.neutralSurface}>
              <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
                {domainLabel('vehicleSourceType', sourceType)}
              </Text>
            </YStack>
          </XStack>
          {!source.isLoading && !source.isError ? (
            <LinkArrow
              label={detail ? t('configure') : t('add')}
              onPress={() =>
                navigateOnce(ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.SOURCE))
              }
            />
          ) : null}
        </XStack>
        {source.isLoading || moneyLoading ? (
          <SkeletonText lines={3} />
        ) : source.isError ? (
          <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
            {t('error')}
          </Text>
        ) : !detail ? (
          <Text col={colors.textMuted} fos={typeScale.body.fontSize}>
            {t('missing')}
          </Text>
        ) : (
          <YStack gap={space.sm}>
            {lines.map((line) =>
              line.value === null ? (
                <Text key={line.key} col={colors.textMuted} fos={typeScale.label.fontSize}>
                  {line.label}
                </Text>
              ) : (
                <XStack
                  key={line.key}
                  ai="center"
                  jc="space-between"
                  gap={space.sm}
                  {...(line.key === 'net' || line.key === 'shopShare' || line.key === 'roi'
                    ? { pt: space.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle }
                    : {})}
                >
                  {typeof line.label === 'string' ? (
                    <Text f={1} minWidth={0} col={colors.textMuted} fos={typeScale.body.fontSize}>
                      {line.label}
                    </Text>
                  ) : (
                    <YStack f={1} minWidth={0}>
                      {line.label}
                    </YStack>
                  )}
                  <Text col={toneColor(line.tone)} fos={typeScale.body.fontSize} fow={fontWeight.semibold}>
                    {line.value}
                  </Text>
                </XStack>
              ),
            )}
          </YStack>
        )}
      </YStack>
    </Card>
  );
}

/**
 * Dòng tóm tắt ở tab "Tài chính" của chi tiết xe (người dùng chốt 27/11/2026: màn riêng, chi tiết xe
 * chỉ còn một dòng dẫn vào) - doanh thu · lợi nhuận tháng này của xe, chạm mở màn Tài chính xe.
 */
export function VehicleFinanceEntry({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Finance.vehicle');
  const tEntity = useTranslations('Finance.entity');
  const colors = useColors();
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const scope = useMemo<FinanceScope>(() => ({ vehicleId }), [vehicleId]);
  const filters = useMemo(() => buildPeriodRange(DEFAULT_PERIOD), []);
  const summary = useFinanceSummary(filters, scope);
  const data = summary.data;

  return (
    <Card>
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <SectionHeader>{t('title')}</SectionHeader>
          <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
            {t('subtitle')}
          </Text>
        </YStack>
        {summary.isError && !data ? (
          <ScreenError error={summary.error} title={tEntity('error')} onRetry={() => void summary.refetch()} />
        ) : !data ? (
          <SkeletonText lines={2} />
        ) : (
          <XStack gap={space.sm}>
            {[
              { key: 'revenue', label: tEntity('revenue'), value: data.revenue, tone: colors.success },
              {
                key: 'profit',
                label: tEntity('profit'),
                value: data.profit,
                tone: isNegativeMoney(data.profit) ? colors.danger : colors.text,
              },
            ].map((tile) => (
              <YStack key={tile.key} f={1} minWidth={0} gap={2} p={TILE_PAD} br={TILE_RADIUS} bg={colors.background}>
                <Text col={colors.placeholder} fos={typeScale.label.fontSize} numberOfLines={1}>
                  {`${tile.label} - ${tEntity(`periods.${DEFAULT_PERIOD}`)}`}
                </Text>
                <Text
                  col={tile.tone}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {fmt.money(tile.value)}
                </Text>
              </YStack>
            ))}
          </XStack>
        )}
        <XStack jc="flex-end">
          <LinkArrow
            label={t('viewDetail')}
            onPress={() => navigateOnce(ROUTES.manage.vehicleFinance(vehicleId))}
          />
        </XStack>
      </YStack>
    </Card>
  );
}

