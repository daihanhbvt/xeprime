'use client';

import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { DASHBOARD_TREND_MONTHS } from '@xeprime/types';
import { isZeroMoney, sumMoney } from '@xeprime/domain';
import { toChartValue } from '@/components/chart/chart-data';
import { EmptyState } from '@/components/feedback/EmptyState';
import { InfoCard } from '@/components/layout/InfoCard';
import {
  RevenueSourceSegment,
  RevenueSourceTrack,
} from '@/features/finance/components/RevenueSource';
import type { FinanceSeries, FinanceSourceBreakdown } from '@/features/finance/types';
import {
  REVENUE_SOURCE_VIEW,
  sharePercent,
  tripsOf,
  type RevenueSourceView,
  type SourceGroup,
} from '@/features/finance/vehicle-finance';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { DASHBOARD_REVENUE_DAYS } from '../api';
import type { PartnerTrendPoint } from '../types';
import styles from './TrendCards.module.css';

/** Số cột của "Thu chi 30 ngày" — cùng hằng với app Partner (`REVENUE_BARS`). */
const REVENUE_BARS = 5;

/** Chiều cao cột chỉ biết lúc chạy ⇒ CSS custom property (ngoại lệ duy nhất cho inline style). */
function barStyle(percent: number): CSSProperties {
  return { '--bar': Math.max(0, Math.min(100, percent)) / 100 } as CSSProperties;
}

/** Ba phần của cột doanh thu, từ chân lên đỉnh - cùng thứ tự với biểu đồ ở màn Tổng quan doanh thu. */
const STACK_GROUPS: readonly SourceGroup[] = ['marketplace', 'direct', 'unlinked'];

/**
 * "Thu chi 30 ngày gần nhất" — Figma `24138:80477`: ba ô tổng (doanh thu vàng nhạt · chi phí xám
 * · lợi nhuận xanh), rồi năm cột doanh thu có số trên đầu. Cùng cách gom với `RevenueTab` của
 * app: chuỗi ngày chia đều thành `REVENUE_BARS` nhóm, nhãn là ngày đầu nhóm.
 *
 * Theo NGUỒN ĐƠN (ADR 0110, 26/11/2026 - như tab Tài chính của hồ sơ xe): dưới ba ô tổng là tỷ trọng
 * qua sàn XePrime · nguồn ngoài (· thu không gắn đơn khi có), mỗi dòng mở màn Tổng quan doanh thu
 * đúng góc nhìn đó; mỗi cột doanh thu là cột CHỒNG ba phần, tổng chiều cao vẫn là doanh thu.
 */
export function RevenueCard({
  series,
  bySource,
  detailHref,
}: {
  series: UseQueryResult<FinanceSeries>;
  bySource: UseQueryResult<FinanceSourceBreakdown>;
  /** Màn Tổng quan doanh thu cùng 30 ngày, mở sẵn một góc nhìn nguồn (`null` = mọi nguồn). */
  detailHref: (view: RevenueSourceView | null) => string;
}) {
  const t = useTranslations('Dashboard.charts');
  const tSource = useTranslations('Finance.bySource.chart');
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
    const list: {
      key: string;
      label: string;
      revenue: string;
      parts: Record<SourceGroup, string>;
    }[] = [];
    for (let i = 0; i < buckets.length; i += size) {
      const chunk = buckets.slice(i, i + size);
      const head = chunk[0]!;
      list.push({
        key: head.bucket,
        label: fmt.dayMonth(head.bucket),
        revenue: sumMoney(chunk.map((b) => b.revenue)),
        parts: {
          marketplace: sumMoney(chunk.map((b) => b.marketplaceRevenue)),
          direct: sumMoney(chunk.map((b) => b.directRevenue)),
          unlinked: sumMoney(chunk.map((b) => b.unlinkedRevenue)),
        },
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
        <SourceSplit query={bySource} detailHref={detailHref} />
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
                  className={cx(styles.bar, styles.barStack)}
                  style={barStyle((Math.max(0, toChartValue(group.revenue)) / max) * 100)}
                  title={STACK_GROUPS.filter((g) => !isZeroMoney(group.parts[g]))
                    .map((g) => `${tSource(g)}: ${fmt.money(group.parts[g])}`)
                    .join('\n')}
                >
                  {STACK_GROUPS.map((g) => {
                    const value = Math.max(0, toChartValue(group.parts[g]));
                    if (value === 0) return null;
                    return (
                      <span
                        key={g}
                        className={cx(styles.stackPart, styles[`stack_${g}`])}
                        style={partStyle(value)}
                      />
                    );
                  })}
                </span>
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

/** Tỷ phần một khúc trong cột chồng - giá trị chỉ biết lúc chạy ⇒ CSS custom property. */
function partStyle(value: number): CSSProperties {
  return { '--part': value } as CSSProperties;
}

/**
 * Tỷ trọng doanh thu theo nguồn của 30 ngày - thanh tỷ trọng rồi từng dòng (chấm màu · tên · số
 * chuyến · tiền · %). Số liệu từ `/finance/by-source` cùng cửa sổ, nên tổng khớp ô Doanh thu. Kỳ
 * chưa có doanh thu thì khối tự vắng: ba dòng 0đ không nói thêm gì.
 */
function SourceSplit({
  query,
  detailHref,
}: {
  query: UseQueryResult<FinanceSourceBreakdown>;
  detailHref: (view: RevenueSourceView | null) => string;
}) {
  const t = useTranslations('Dashboard.charts.sources');
  const tSource = useTranslations('Finance.bySource.chart');
  const fmt = useAppFormat();
  const data = query.data;

  if (query.isPending) return <Skeleton active title={false} paragraph={{ rows: 2 }} />;
  if (!data) {
    return query.isError ? <p className={styles.sourcesError}>{t('error')}</p> : null;
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
    <div className={styles.sources}>
      <div className={styles.sourcesHead}>
        <span className={styles.sourcesTitle}>{t('title')}</span>
        <Link className={styles.sourcesLink} href={detailHref(null)}>
          {t('detail')}
        </Link>
      </div>
      <RevenueSourceTrack>
        {rows.map((row) => (
          <RevenueSourceSegment
            key={row.group}
            share={sharePercent(row.amount, data.total)}
            group={row.group}
          />
        ))}
      </RevenueSourceTrack>
      <ul className={styles.sourceList} aria-label={t('legend')}>
        {rows.map((row) => (
          <li key={row.group}>
            <Link className={styles.sourceRow} href={detailHref(row.view)}>
              <span className={styles.sourceName}>
                <span className={cx(styles.sourceDot, styles[`stack_${row.group}`])} aria-hidden />
                <span className={styles.sourceNameText}>{tSource(row.group)}</span>
                {row.trips !== null ? (
                  <span className={styles.sourceTrips}>{t('trips', { count: row.trips })}</span>
                ) : null}
              </span>
              <span className={styles.sourceAmount}>
                {fmt.money(row.amount)}
                <span className={styles.sourceShare}>
                  {t('share', { percent: sharePercent(row.amount, data.total) })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
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
