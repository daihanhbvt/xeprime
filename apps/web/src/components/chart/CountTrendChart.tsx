'use client';

import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppFormat } from '@/i18n/use-app-format';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip, type TooltipRow } from './ChartTooltip';
import { CHART_AXIS, CHART_BAR_RADIUS, CHART_GRID, CHART_SERIES_COLORS } from './chart-theme';

/** Một nhóm cột — `values` là SỐ ĐẾM (đơn, chuyến), không bao giờ là tiền. */
export interface CountTrendPoint {
  /** Khoá trục X (`YYYY-MM`, `YYYY-MM-DD`…) — nhãn hiển thị do `labelOf` dựng. */
  key: string;
  values: Readonly<Record<string, number>>;
}

export interface CountTrendSeries {
  key: string;
  label: string;
}

interface CountTrendChartProps {
  points: readonly CountTrendPoint[];
  series: readonly CountTrendSeries[];
  labelOf: (key: string) => string;
  title: string;
  description?: string;
  height?: number;
  loading?: boolean;
  error?: { title: string; onRetry?: () => void } | null;
  empty?: { title: string; description?: string } | null;
}

interface Row {
  key: string;
  label: string;
  [series: string]: string | number;
}

/**
 * Cột NHÓM cho vài chuỗi SỐ ĐẾM theo kỳ — "đơn mới" và "chuyến hoàn thành" theo tháng.
 *
 * Một trục Y, số nguyên: các chuỗi cùng đơn vị (số lượng) nên so trực tiếp được. Màu đi theo thứ
 * tự của dải định danh (`CHART_SERIES_COLORS`) — không series nào có "vai" tiền ở đây, nên không
 * mượn màu doanh thu/chi phí.
 */
export function CountTrendChart({
  points,
  series,
  labelOf,
  title,
  description,
  height = 240,
  loading,
  error,
  empty,
}: CountTrendChartProps) {
  const fmt = useAppFormat();
  const colored = series.map((s, i) => ({
    ...s,
    color: CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]!,
  }));

  const rows: Row[] = points.map((p) => ({
    key: p.key,
    label: labelOf(p.key),
    ...Object.fromEntries(colored.map((s) => [s.key, p.values[s.key] ?? 0])),
  }));

  return (
    <ChartFrame
      title={title}
      description={description}
      height={height}
      loading={loading}
      error={error}
      empty={empty}
    >
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...CHART_AXIS} width={36} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'var(--xp-color-bg-muted)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as Row | undefined;
            if (!row) return null;
            const tooltipRows: TooltipRow[] = colored.map((s) => {
              const value = Number(row[s.key] ?? 0);
              return { key: s.key, label: s.label, color: s.color, raw: String(value), text: fmt.count(value) };
            });
            return <ChartTooltip title={row.label} rows={tooltipRows} />;
          }}
        />
        <Legend iconType="circle" iconSize={8} />
        {colored.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={CHART_BAR_RADIUS}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}
