'use client';

import { Alert, Segmented } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { moneyChangePercent, moneyPerPart } from '@xeprime/domain';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  type FinanceGranularity,
} from '@xeprime/types';
import {
  SourceRevenueTrendChart,
  SourceRevenueTrendLegend,
} from '@/components/chart/SourceRevenueTrendChart';
import { InfoHint } from '@/components/data-display/InfoHint';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { receiptsPath } from '@/constants/routes';
import { ChangeBadge } from '@/features/dashboard/components/ChangeBadge';
import { CategoryBreakdown } from '@/features/finance/components/CategoryBreakdown';
import { RevenueSourceCards, RevenueSourceRows } from '@/features/finance/components/RevenueSource';
import { FINANCE_OVERVIEW_PERIOD_VALUES } from '@/features/finance/constants';
import {
  useFinanceByCategory,
  useFinanceBySource,
  useFinanceSeries,
  useFinanceSummaryOverview,
} from '@/features/finance/hooks/use-finance-overview';
import { parsePeriodParams } from '@/features/finance/hooks/use-finance-overview-filters';
import type {
  FinancePeriodFilters,
  FinanceScope,
  FinanceSourceBreakdown,
} from '@/features/finance/types';
import {
  REVENUE_SOURCE_PARAM,
  REVENUE_SOURCE_VIEW,
  comparablePreviousRange,
  parseRevenueSourceView,
  revenueOf,
  tripsOf,
  type RevenueSourceView,
} from '@/features/finance/vehicle-finance';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { DAY_PARAM_FORMAT, buildPeriodRange, nowInAppTz } from '@/lib/datetime';
import { isNegativeMoney, isZeroMoney } from '@/lib/money';
import type { VehicleDetail } from '../types';
import { Panel } from './Vehicle360Cards';
import { VehicleCapitalCard } from './VehicleCapitalCard';
import styles from './VehicleFinanceTab.module.css';

type PeriodOption = (typeof FINANCE_OVERVIEW_PERIOD_VALUES)[number];

/** Kỳ "Toàn bộ" - giá trị của `?period=` (không dùng `all`: `useUrlFilters` xoá `all`). */
const ALL_TIME = 'all_time';
const PERIOD_PARAM = 'period';

/** Độ mịn mặc định khi chọn một kỳ - số cột vừa mắt cho từng độ dài kỳ. */
const PERIOD_GRANULARITY: Record<PeriodOption, FinanceGranularity> = {
  today: FINANCE_GRANULARITY.DAY,
  this_week: FINANCE_GRANULARITY.DAY,
  this_month: FINANCE_GRANULARITY.DAY,
  last_month: FINANCE_GRANULARITY.DAY,
  this_quarter: FINANCE_GRANULARITY.WEEK,
  this_year: FINANCE_GRANULARITY.MONTH,
};

interface VehicleFinanceFilters extends FinancePeriodFilters {
  revenueSource?: string;
  period?: string;
}

interface VehicleFinanceTabProps {
  vehicle: VehicleDetail;
  /** Người xem ghi được phiếu - quyết định nút "Tạo phiếu thu/chi". Guard backend mới là bảo vệ. */
  canCreateReceipt: boolean;
  /**
   * Thẻ "Nghĩa vụ nguồn xe" - sổ nguồn xe là của gian hàng tuyến gói, chủ xe tuyến hoa hồng không
   * có (cùng điều kiện với thẻ "Nguồn xe & tài chính" ở tab Tổng quan).
   */
  showCapital: boolean;
}

/**
 * Tab Tài chính của hồ sơ xe - "chiếc xe này kiếm được bao nhiêu, từ đâu, tốn bao nhiêu, có tự
 * nuôi được nguồn vốn của nó không".
 *
 * Mọi con số đến từ CÙNG bộ endpoint của màn Tổng quan doanh thu, thu hẹp bằng `vehicleId`, nên số
 * ở đây không thể lệch dòng của xe trong bảng tổng quan. Kỳ (`from`/`to`/`granularity`) và góc
 * nhìn theo nguồn (`revenueSource`) nằm trên URL (ADR 0004): gửi đường dẫn là gửi đúng màn đang xem.
 *
 * Chọn nguồn CHỈ đổi phần doanh thu (ô Doanh thu, số chuyến, TB/chuyến, phần được nhấn trên biểu
 * đồ, danh sách nguồn). Chi phí và lợi nhuận luôn là của CẢ XE: chi phí bảo dưỡng không thuộc
 * nguồn nào, và "doanh thu qua sàn trừ toàn bộ chi phí" là một con số không có nghĩa.
 */
export function VehicleFinanceTab({
  vehicle,
  canCreateReceipt,
  showCapital,
}: VehicleFinanceTabProps) {
  const t = useTranslations('Finance.vehicle');
  const tEntity = useTranslations('Finance.entity');
  const tSource = useTranslations('Finance.bySource');
  const fmt = useAppFormat();
  const scope = useMemo<FinanceScope>(() => ({ vehicleId: vehicle.id }), [vehicle.id]);

  /*
   * MỘT bộ lọc URL cho cả tab: đổi kỳ sang "Toàn bộ" phải xoá `from`/`to` VÀ đặt `period` trong
   * cùng một lượt ghi - hai hook ghi nối nhau thì lượt sau đọc URL cũ và ghi đè lượt trước.
   */
  const { filters: raw, setFilters } = useUrlFilters<VehicleFinanceFilters>((sp) => ({
    ...parsePeriodParams(sp),
    revenueSource: parseRevenueSourceView(sp.get(REVENUE_SOURCE_PARAM)) ?? undefined,
    period: sp.get(PERIOD_PARAM) === ALL_TIME ? ALL_TIME : undefined,
  }));
  const allTime = raw.period === ALL_TIME;
  // "Toàn bộ" = không gửi `from`/`to`: mọi endpoint báo cáo hiểu thiếu kỳ là toàn bộ thời gian.
  const filters = useMemo<FinancePeriodFilters>(
    () => ({
      branchId: raw.branchId,
      granularity: raw.granularity,
      ...(allTime ? {} : { from: raw.from, to: raw.to }),
    }),
    [allTime, raw.branchId, raw.granularity, raw.from, raw.to],
  );
  const view = parseRevenueSourceView(raw.revenueSource);

  const today = useMemo(() => nowInAppTz().format(DAY_PARAM_FORMAT), []);
  // Toàn bộ thời gian không có "cùng kỳ trước" để so.
  const previousRange = allTime ? null : comparablePreviousRange(filters.from, filters.to, today);

  const summary = useFinanceSummaryOverview(filters, scope);
  const series = useFinanceSeries(filters, scope);
  const bySource = useFinanceBySource(filters, scope);
  const costs = useFinanceByCategory(filters, RECEIPT_TYPE.EXPENSE, scope);
  const previous = useFinanceBySource(
    { ...filters, ...(previousRange ?? {}) },
    scope,
    previousRange !== null,
  );

  const periodOptions = useMemo(
    () => [
      ...FINANCE_OVERVIEW_PERIOD_VALUES.map((value) => ({
        value: value as string,
        label: tEntity(`periods.${value}`),
      })),
      { value: ALL_TIME, label: t('allTime') },
    ],
    [t, tEntity],
  );
  const granularityOptions = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: tEntity(`every.${value}`) })),
    [tEntity],
  );
  const activePeriod = allTime
    ? ALL_TIME
    : FINANCE_OVERVIEW_PERIOD_VALUES.find((value) => {
        const range = buildPeriodRange(value);
        return filters.from === range.from && filters.to === range.to;
      });

  /*
   * Đổi kỳ thì đổi luôn độ mịn cho HỢP kỳ (người dùng vẫn đổi tay được): giữ "Tuần" khi chuyển sang
   * "Năm nay" là 53 cột mảnh như sợi chỉ, giữ "Ngày" cho "Toàn bộ" là server tự nâng bậc mà nút vẫn
   * sáng "Ngày".
   */
  const choosePeriod = (value: string) => {
    if (value === ALL_TIME) {
      setFilters({
        period: ALL_TIME,
        from: undefined,
        to: undefined,
        granularity: FINANCE_GRANULARITY.MONTH,
      });
      return;
    }
    const period = value as PeriodOption;
    setFilters({
      period: undefined,
      ...buildPeriodRange(period),
      granularity: PERIOD_GRANULARITY[period],
    });
  };

  // Nhãn cột theo độ mịn server THẬT đã dùng (kỳ dài bị nâng lên `month`).
  const granularity = series.data?.granularity ?? filters.granularity;
  const labelOf = (bucket: string) =>
    granularity === 'month' ? fmt.monthYear(new Date(`${bucket}T12:00:00Z`)) : fmt.dateKey(bucket);
  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((b) => isZeroMoney(b.revenue) && isZeroMoney(b.cost));
  const showUnlinkedLegend =
    series.data?.buckets.some((b) => !isZeroMoney(b.unlinkedRevenue)) ?? false;

  const changeView = (next: RevenueSourceView | null) =>
    setFilters({ revenueSource: next ?? undefined }, { resetPage: false });

  const headerActions = (
    <div className={styles.actions}>
      <Link
        className={styles.ghostAction}
        href={receiptsPath.filtered({
          ...scope,
          status: RECEIPT_STATUS.APPROVED,
          // CHỈ hai đầu kỳ - `granularity` là chuyện của biểu đồ, sổ không hiểu nó.
          from: filters.from,
          to: filters.to,
        })}
      >
        {t('openLedger')}
      </Link>
      {/*
        Ghi một khoản THẲNG cho xe này (rửa xe, vá lốp...). Không mang kỳ đang xem: phiếu sắp ghi
        mặc định là hôm nay, mang `from`/`to` sang thì sổ mở ra không chứa chính phiếu vừa tạo.
      */}
      {canCreateReceipt ? (
        <Link
          className={styles.primaryAction}
          href={receiptsPath.filtered({ vehicleId: vehicle.id, create: true })}
        >
          {t('createReceipt')}
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className={styles.root}>
      <Panel
        className={styles.wrapHead}
        title={t('title')}
        subtitle={t('subtitle')}
        extra={headerActions}
      >
        <div className={styles.toolbar}>
          <div className={styles.periods}>
            <Segmented
              size="small"
              options={periodOptions}
              value={activePeriod ?? ''}
              onChange={(value) => choosePeriod(String(value))}
              aria-label={tEntity('periods.label')}
            />
          </div>
          <div className={styles.granularity}>
            <span>{tEntity('every.label')}</span>
            <Segmented
              size="small"
              options={granularityOptions}
              value={granularity ?? FINANCE_GRANULARITY_VALUES[0]}
              onChange={(value) => setFilters({ granularity: String(value) })}
              aria-label={tEntity('every.label')}
            />
          </div>
        </div>

        <RevenueSourceCards
          data={bySource.data}
          loading={bySource.isFetching && !bySource.data}
          error={bySource.isError && !bySource.data}
          onRetry={() => void bySource.refetch()}
          view={view}
          onChange={changeView}
        />

        {summary.isError && !summary.data ? (
          <Alert type="warning" showIcon title={tEntity('error')} />
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
      </Panel>

      <SourceRevenueTrendChart
        className={styles.chartCard}
        points={series.data?.buckets ?? []}
        labelOf={labelOf}
        title={tSource('chart.title')}
        description={t('chart.description')}
        actions={<SourceRevenueTrendLegend showUnlinked={showUnlinkedLegend} />}
        height={240}
        highlight={
          view === REVENUE_SOURCE_VIEW.MARKETPLACE
            ? 'marketplace'
            : view === REVENUE_SOURCE_VIEW.DIRECT
              ? 'direct'
              : null
        }
        loading={series.isFetching && !series.data}
        error={
          series.isError && !series.data
            ? { title: tEntity('chartError'), onRetry: () => void series.refetch() }
            : null
        }
        empty={
          seriesEmpty
            ? { title: tEntity('chartEmpty'), description: tEntity('chartEmptyHint') }
            : null
        }
      />

      <div className={styles.columns}>
        <Panel
          className={cx(styles.rowsPanel, styles.wrapHead)}
          title={
            <span className={styles.titleWithInfo}>
              {tSource('rows.title')}
              <InfoHint
                content={tSource('rows.bookedInfo')}
                label={tSource('rows.bookedInfoLabel')}
              />
            </span>
          }
          subtitle={tSource('rows.subtitle')}
          extra={
            bySource.data ? (
              <span className={styles.rowsTotal}>
                {tSource('rows.total', { amount: fmt.money(revenueOf(bySource.data, view)) })}
              </span>
            ) : null
          }
        >
          <RevenueSourceRows
            data={bySource.data}
            loading={bySource.isFetching && !bySource.data}
            error={bySource.isError && !bySource.data}
            onRetry={() => void bySource.refetch()}
            view={view}
          />
        </Panel>
        <div className={styles.side}>
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
        </div>
      </div>
    </div>
  );
}

/* ─── Bốn ô số ─────────────────────────────────────────────────────────────── */

function KpiTiles({
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
  summary: ReturnType<typeof useFinanceSummaryOverview>['data'];
  /** Có "cùng kỳ trước" để so không - kỳ "Toàn bộ" thì không. */
  compare: boolean;
  summaryLoading: boolean;
  bySource: FinanceSourceBreakdown | undefined;
  sourceLoading: boolean;
  /** `null` = không có kỳ để so (kỳ chưa bắt đầu); `undefined` = chưa tải xong. */
  previous: FinanceSourceBreakdown | null | undefined;
  previousLoading: boolean;
  costCount: number | null;
  view: RevenueSourceView | null;
}) {
  const t = useTranslations('Finance.vehicle.kpi');
  const tEntity = useTranslations('Finance.entity');
  const fmt = useAppFormat();

  const revenue = bySource ? revenueOf(bySource, view) : null;
  const trips = bySource ? tripsOf(bySource.items, view) : null;
  const average = revenue !== null && trips ? moneyPerPart(revenue, trips) : null;
  const change =
    revenue !== null && previous ? moneyChangePercent(revenue, revenueOf(previous, view)) : null;

  return (
    <div className={styles.kpis}>
      <MoneyStat
        label={t(`revenue.${view ?? 'all'}`)}
        value={revenue !== null ? fmt.money(revenue) : null}
        tone="positive"
        size="compact"
        loading={sourceLoading}
        info={{ content: t('revenueInfo'), label: t('revenueInfoLabel') }}
        hint={
          bySource ? (
            <span className={styles.hintStack}>
              {!compare || previousLoading ? null : (
                <ChangeBadge
                  value={change}
                  suffix={t('changeSuffix')}
                  noneLabel={t('changeNone')}
                />
              )}
              <span>
                {trips && average
                  ? t('revenueHint', { count: trips, avg: fmt.money(average) })
                  : t('revenueHintNoTrips')}
              </span>
            </span>
          ) : undefined
        }
      />
      <MoneyStat
        label={t('cost')}
        value={summary ? fmt.money(summary.cost) : null}
        tone="negative"
        size="compact"
        loading={summaryLoading}
        info={{ content: t('costInfo'), label: t('costInfoLabel') }}
        hint={costCount !== null ? <span>{t('costHint', { count: costCount })}</span> : undefined}
      />
      <MoneyStat
        label={t('profit')}
        value={summary ? fmt.money(summary.profit) : null}
        tone={isNegativeMoney(summary?.profit) ? 'negative' : 'accent'}
        size="compact"
        loading={summaryLoading}
        info={{ content: t('profitInfo'), label: t('profitInfoLabel') }}
        hint={
          summary ? (
            <span>
              {summary.profitMarginPercent == null
                ? tEntity('marginUnknown')
                : tEntity('margin', { value: summary.profitMarginPercent })}
            </span>
          ) : undefined
        }
      />
      <MoneyStat
        label={t('debt')}
        value={summary ? fmt.money(summary.totalDebt) : null}
        tone={summary && !isZeroMoney(summary.totalDebt) ? 'negative' : 'neutral'}
        size="compact"
        loading={summaryLoading}
        info={{ content: t('debtInfo'), label: t('debtInfoLabel') }}
        hint={
          summary ? (
            <span>
              {t('debtHint', {
                count: summary.debtBookings,
                deposit: fmt.money(summary.depositHeld),
              })}
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
