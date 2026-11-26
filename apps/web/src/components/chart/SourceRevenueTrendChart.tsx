'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip, type TooltipRow } from './ChartTooltip';
import {
  CHART_AXIS,
  CHART_BAR_RADIUS,
  CHART_COLOR,
  CHART_DOT_RADIUS,
  CHART_GRID,
  CHART_LINE_WIDTH,
  CHART_SOURCE_COLOR,
  type ChartSourceRole,
} from './chart-theme';
import { toChartValue } from './chart-data';
import styles from './SourceRevenueTrendChart.module.css';

/** Một cột - tiền vẫn là CHUỖI ở đây; quy đổi sang số xảy ra bên trong (`toChartValue`). */
export interface SourceTrendPoint {
  bucket: string;
  marketplaceRevenue: string;
  directRevenue: string;
  unlinkedRevenue: string;
  cost: string;
  profit: string;
}

interface SourceRevenueTrendChartProps {
  points: readonly SourceTrendPoint[];
  /** Nhãn trục X đã dựng sẵn theo độ mịn THẬT server đã dùng. */
  labelOf: (bucket: string) => string;
  title: string;
  description?: string;
  actions?: ReactNode;
  height?: number;
  /**
   * Phần doanh thu đang được chọn ở trên (sàn / tự khai thác). Phần còn lại vẫn VẼ nhưng mờ đi:
   * giấu hẳn nó thì cột chồng không còn bằng doanh thu cả xe, và đường lợi nhuận (của cả xe) sẽ
   * nằm cao hơn cột một cách vô lý.
   */
  highlight?: Exclude<ChartSourceRole, 'unlinked'> | null;
  loading?: boolean;
  error?: { title: string; onRetry?: () => void } | null;
  empty?: { title: string; description?: string } | null;
  className?: string;
}

interface Row extends SourceTrendPoint {
  label: string;
  marketplaceValue: number;
  directValue: number;
  unlinkedValue: number;
  costValue: number;
  profitValue: number;
}

const DIMMED_OPACITY = 0.25;
/** Quá số cột này thì coi là dày - xem `dense`. */
const DENSE_BUCKETS = 16;

/**
 * Doanh thu THEO NGUỒN ĐƠN · Chi phí · Lợi nhuận theo thời gian (hồ sơ xe · Tổng quan doanh thu).
 *
 * Cột doanh thu là cột CHỒNG ba phần (qua sàn · tự khai thác · không gắn đơn) - tổng chiều cao vẫn
 * là doanh thu của kỳ, như cột doanh thu của `RevenueTrendChart`. Chi phí là cột riêng đứng cạnh,
 * lợi nhuận là đường (hiệu của hai cột). Một trục Y duy nhất: cả năm đại lượng là tiền cùng thang.
 */
export function SourceRevenueTrendChart({
  points,
  labelOf,
  title,
  description,
  actions,
  height,
  highlight = null,
  loading,
  error,
  empty,
  className,
}: SourceRevenueTrendChartProps) {
  const t = useTranslations('Finance.bySource.chart');
  const fmt = useAppFormat();

  const rows: Row[] = points.map((p) => ({
    ...p,
    label: labelOf(p.bucket),
    marketplaceValue: toChartValue(p.marketplaceRevenue),
    directValue: toChartValue(p.directRevenue),
    unlinkedValue: toChartValue(p.unlinkedRevenue),
    costValue: toChartValue(p.cost),
    profitValue: toChartValue(p.profit),
  }));

  // Nhiều cột (tuần cả năm, ngày cả quý): bỏ chấm trên đường lợi nhuận và khít cột lại - chấm dày
  // đặc che mất hình, còn khe rộng biến cột thành sợi chỉ. Tooltip vẫn đọc từng cột.
  const dense = rows.length > DENSE_BUCKETS;

  // Phần "không gắn đơn" chỉ vào chú giải và tooltip khi kỳ này thật sự có nó.
  const hasUnlinked = rows.some((row) => row.unlinkedValue !== 0);
  const opacityOf = (role: ChartSourceRole) =>
    highlight === null || role === highlight ? 1 : DIMMED_OPACITY;

  const series: {
    key: string;
    raw: keyof SourceTrendPoint;
    label: string;
    color: string;
  }[] = [
    {
      key: 'marketplace',
      raw: 'marketplaceRevenue',
      label: t('marketplace'),
      color: CHART_SOURCE_COLOR.marketplace,
    },
    {
      key: 'direct',
      raw: 'directRevenue',
      label: t('direct'),
      color: CHART_SOURCE_COLOR.direct,
    },
    ...(hasUnlinked
      ? [
          {
            key: 'unlinked',
            raw: 'unlinkedRevenue' as const,
            label: t('unlinked'),
            color: CHART_SOURCE_COLOR.unlinked,
          },
        ]
      : []),
    {
      key: 'cost',
      raw: 'cost',
      label: t('cost'),
      color: CHART_COLOR.cost,
    },
    {
      key: 'profit',
      raw: 'profit',
      label: t('profit'),
      color: CHART_COLOR.profit,
    },
  ];

  return (
    <ChartFrame
      className={className}
      title={title}
      description={description}
      actions={actions}
      height={height}
      loading={loading}
      error={error}
      empty={empty}
    >
      <ComposedChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        barGap={3}
        barCategoryGap={dense ? '12%' : '28%'}
      >
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={16} />
        <YAxis
          {...CHART_AXIS}
          width={64}
          tickFormatter={(v: number) => fmt.moneyCompact(String(v))}
        />
        <Tooltip
          cursor={{ fill: 'var(--xp-color-bg-muted)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as Row | undefined;
            if (!row) return null;
            const tooltipRows: TooltipRow[] = series.map((s) => ({
              key: s.key,
              label: s.label,
              color: s.color,
              raw: row[s.raw],
            }));
            return <ChartTooltip title={row.label} rows={tooltipRows} />;
          }}
        />
        {/* Chân cột chồng neo vào 0, chỉ phần trên cùng có thể bo - để vuông cả ba cho liền khối. */}
        <Bar
          dataKey="marketplaceValue"
          name={t('marketplace')}
          stackId="revenue"
          fill={CHART_SOURCE_COLOR.marketplace}
          fillOpacity={opacityOf('marketplace')}
          maxBarSize={40}
        />
        <Bar
          dataKey="directValue"
          name={t('direct')}
          stackId="revenue"
          fill={CHART_SOURCE_COLOR.direct}
          fillOpacity={opacityOf('direct')}
          maxBarSize={40}
        />
        {hasUnlinked ? (
          <Bar
            dataKey="unlinkedValue"
            name={t('unlinked')}
            stackId="revenue"
            fill={CHART_SOURCE_COLOR.unlinked}
            fillOpacity={opacityOf('unlinked')}
            maxBarSize={40}
          />
        ) : null}
        <Bar
          dataKey="costValue"
          name={t('cost')}
          fill={CHART_COLOR.cost}
          radius={CHART_BAR_RADIUS}
          maxBarSize={24}
        />
        <Line
          type="monotone"
          dataKey="profitValue"
          name={t('profit')}
          stroke={CHART_COLOR.profit}
          strokeWidth={CHART_LINE_WIDTH}
          dot={dense ? false : { r: CHART_DOT_RADIUS, strokeWidth: 0, fill: CHART_COLOR.profit }}
          activeDot={{ r: CHART_DOT_RADIUS + 2 }}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

/**
 * Chú giải của `SourceRevenueTrendChart`, đặt ngoài vùng vẽ (cạnh tiêu đề khối). Cùng nhãn, cùng
 * màu với tooltip; `showUnlinked` theo đúng điều kiện biểu đồ có vẽ phần đó hay không.
 */
export function SourceRevenueTrendLegend({ showUnlinked }: { showUnlinked: boolean }) {
  const t = useTranslations('Finance.bySource.chart');
  const items = [
    { key: 'marketplace', label: t('marketplace'), className: styles.swatchMarketplace },
    { key: 'direct', label: t('direct'), className: styles.swatchDirect },
    ...(showUnlinked
      ? [{ key: 'unlinked', label: t('unlinked'), className: styles.swatchUnlinked }]
      : []),
    { key: 'cost', label: t('cost'), className: styles.swatchCost },
    { key: 'profit', label: t('profit'), className: styles.swatchProfit },
  ];
  return (
    <ul className={styles.legend} aria-label={t('legend')}>
      {items.map((item) => (
        <li key={item.key} className={styles.legendItem}>
          <span className={cx(item.className)} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
