'use client';

import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { DASHBOARD_REVENUE_DAYS, DASHBOARD_TREND_MONTHS } from '@xeprime/types';
import { isZeroMoney, sumMoney } from '@xeprime/domain';
import { toChartValue } from '@/components/chart/chart-data';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoCard } from '@/components/layout/InfoCard';
import type { FinanceSeries } from '@/features/finance/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { PartnerTrendPoint } from '../types';
import styles from './TrendCards.module.css';

/** Số cột của "Thu chi 30 ngày" — cùng hằng với app Partner (`REVENUE_BARS`). */
const REVENUE_BARS = 5;

/** Chiều cao cột chỉ biết lúc chạy ⇒ CSS custom property (ngoại lệ duy nhất cho inline style). */
function barStyle(percent: number): CSSProperties {
  return { '--bar': Math.max(0, Math.min(100, percent)) / 100 } as CSSProperties;
}

/**
 * "Thu chi 30 ngày gần nhất" — Figma `24138:80477`: ba ô tổng (doanh thu vàng nhạt · chi phí xám
 * · lợi nhuận xanh), rồi năm cột doanh thu vàng có số trên đầu. Cùng cách gom với `RevenueTab` của
 * app: chuỗi ngày chia đều thành `REVENUE_BARS` nhóm, nhãn là ngày đầu nhóm.
 */
export function RevenueCard({ series }: { series: UseQueryResult<FinanceSeries> }) {
  const t = useTranslations('Dashboard.charts');
  const fmt = useAppFormat();
  const buckets = useMemo(() => series.data?.buckets ?? [], [series.data]);

  const totals = useMemo(
    () => ({
      revenue: sumMoney(buckets.map((b) => b.revenue)),
      cost: sumMoney(buckets.map((b) => b.cost)),
      profit: sumMoney(buckets.map((b) => b.profit)),
    }),
    [buckets],
  );

  const groups = useMemo(() => {
    if (buckets.length === 0) return [];
    const size = Math.max(1, Math.ceil(buckets.length / REVENUE_BARS));
    const list: { key: string; label: string; revenue: string }[] = [];
    for (let i = 0; i < buckets.length; i += size) {
      const chunk = buckets.slice(i, i + size);
      const head = chunk[0]!;
      list.push({
        key: head.bucket,
        label: fmt.dayMonth(head.bucket),
        revenue: sumMoney(chunk.map((b) => b.revenue)),
      });
    }
    return list;
  }, [buckets, fmt]);

  const empty =
    series.data !== undefined &&
    buckets.every((b) => isZeroMoney(b.revenue) && isZeroMoney(b.cost));
  const max = Math.max(1, ...groups.map((g) => toChartValue(g.revenue)));

  let body;
  if (series.isPending) body = <Skeleton active title={false} paragraph={{ rows: 6 }} />;
  else if (series.isError && !series.data)
    body = (
      <EmptyState variant="error" title={t('revenueError')} onRetry={() => void series.refetch()} />
    );
  else if (empty)
    body = (
      <EmptyState
        variant="empty"
        title={t('revenueEmpty', { days: DASHBOARD_REVENUE_DAYS })}
        description={t('revenueEmptyHint')}
      />
    );
  else
    body = (
      <>
        <div className={styles.totals}>
          <MoneyTile label={t('revenue')} value={fmt.money(totals.revenue)} tone="gold" />
          <MoneyTile label={t('cost')} value={fmt.money(totals.cost)} tone="gray" />
          <MoneyTile label={t('profit')} value={fmt.money(totals.profit)} tone="green" />
        </div>
        <div
          className={styles.chart}
          role="img"
          aria-label={t('revenueSummaryTitle', { days: DASHBOARD_REVENUE_DAYS })}
        >
          <div className={styles.bars}>
            {groups.map((group) => (
              <div key={group.key} className={styles.barCol}>
                <span className={styles.barValue}>{fmt.moneyCompact(group.revenue)}</span>
                <span
                  className={cx(styles.bar, styles.barGold)}
                  style={barStyle((Math.max(0, toChartValue(group.revenue)) / max) * 100)}
                />
              </div>
            ))}
          </div>
          <div className={styles.axis}>
            {groups.map((group) => (
              <span key={group.key} className={styles.axisLabel}>
                {group.label}
              </span>
            ))}
          </div>
        </div>
      </>
    );

  return (
    <InfoCard
      title={t('revenueSummaryTitle', { days: DASHBOARD_REVENUE_DAYS })}
      hint={t('revenueDescription')}
    >
      {body}
    </InfoCard>
  );
}

function MoneyTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'gold' | 'gray' | 'green';
}) {
  return (
    <div className={cx(styles.tile, styles[`tile_${tone}`])}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
    </div>
  );
}

/**
 * "Đơn & chuyến 6 tháng" — Figma `24138:80517`: chú giải kèm TỔNG mỗi chuỗi, cặp cột vàng (đơn mới)
 * / xanh (chuyến hoàn thành) có số trên đầu, nhãn tháng dưới trục.
 */
export function TripsCard({
  trend,
  loading,
  isError,
  onRetry,
}: {
  trend: readonly PartnerTrendPoint[] | undefined;
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('Dashboard.charts');
  const fmt = useAppFormat();
  const points = trend ?? [];
  const empty =
    trend !== undefined && points.every((p) => p.newBookings === 0 && p.completedTrips === 0);
  const max = Math.max(1, ...points.flatMap((p) => [p.newBookings, p.completedTrips]));
  const totalNew = points.reduce((sum, p) => sum + p.newBookings, 0);
  const totalDone = points.reduce((sum, p) => sum + p.completedTrips, 0);

  let body;
  if (!trend && loading) body = <Skeleton active title={false} paragraph={{ rows: 6 }} />;
  else if (!trend && isError)
    body = <EmptyState variant="error" title={t('tripsError')} onRetry={onRetry} />;
  else if (empty)
    body = (
      <EmptyState variant="empty" title={t('tripsEmpty', { months: DASHBOARD_TREND_MONTHS })} />
    );
  else
    body = (
      <>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={cx(styles.legendDot, styles.barGold)} aria-hidden="true" />
            {t('legendTotal', { label: t('newBookings'), count: fmt.count(totalNew) })}
          </span>
          <span className={styles.legendItem}>
            <span className={cx(styles.legendDot, styles.barGreen)} aria-hidden="true" />
            {t('legendTotal', { label: t('completedTrips'), count: fmt.count(totalDone) })}
          </span>
        </div>
        <div
          className={cx(styles.chart, styles.chartTall)}
          role="img"
          aria-label={t('tripsTab', { months: DASHBOARD_TREND_MONTHS })}
        >
          <div className={cx(styles.bars, styles.barsGrouped)}>
            {points.map((point) => (
              <div key={point.period} className={styles.pair}>
                <div className={styles.barColNarrow}>
                  <span className={styles.barValue}>{fmt.count(point.newBookings)}</span>
                  <span
                    className={cx(styles.bar, styles.barGold)}
                    style={barStyle((point.newBookings / max) * 100)}
                  />
                </div>
                <div className={styles.barColNarrow}>
                  <span className={styles.barValue}>{fmt.count(point.completedTrips)}</span>
                  <span
                    className={cx(styles.bar, styles.barGreen)}
                    style={barStyle((point.completedTrips / max) * 100)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className={cx(styles.axis, styles.axisGrouped)}>
            {points.map((point) => (
              <span key={point.period} className={styles.axisLabel}>
                {fmt.monthYear(new Date(`${point.period}-15T12:00:00Z`))}
              </span>
            ))}
          </div>
        </div>
      </>
    );

  return (
    <InfoCard
      title={t('tripsTab', { months: DASHBOARD_TREND_MONTHS })}
      hint={t('tripsDescription')}
    >
      {body}
    </InfoCard>
  );
}
