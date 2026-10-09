'use client';

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppFormat } from '@/i18n/use-app-format';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { CHART_AXIS, CHART_BAR_RADIUS, CHART_COLOR, CHART_GRID, CHART_SERIES_COLORS } from './chart-theme';
import { toChartValue } from './chart-data';

/** Một kỳ: TIỀN (chuỗi, ADR 0007) + SỐ LƯỢNG giao dịch tạo ra số tiền đó. */
export interface MoneyVolumePoint {
  key: string;
  money: string;
  count: number;
}

interface MoneyVolumeChartProps {
  points: readonly MoneyVolumePoint[];
  labelOf: (key: string) => string;
  moneyLabel: string;
  countLabel: string;
  title: string;
  description?: string;
  height?: number;
  loading?: boolean;
  error?: { title: string; onRetry?: () => void } | null;
  empty?: { title: string; description?: string } | null;
}

interface Row extends MoneyVolumePoint {
  label: string;
  moneyValue: number;
}

/**
 * Giá trị giao dịch theo kỳ — cột là TIỀN, số lượng nằm trong tooltip.
 *
 * Cố ý KHÔNG vẽ số lượng thành đường trên trục Y thứ hai: tiền và số đơn khác đơn vị, và hai trục
 * Y là cách nhanh nhất để vẽ ra một tương quan không tồn tại (cùng lý do với `RevenueTrendChart`).
 * Người cần so số đơn rê chuột vào cột — con số vẫn đó, chỉ không giả vờ cùng thang với tiền.
 */
export function MoneyVolumeChart({
  points,
  labelOf,
  moneyLabel,
  countLabel,
  title,
  description,
  height = 260,
  loading,
  error,
  empty,
}: MoneyVolumeChartProps) {
  const fmt = useAppFormat();
  const rows: Row[] = points.map((p) => ({
    ...p,
    label: labelOf(p.key),
    moneyValue: toChartValue(p.money),
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
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...CHART_AXIS} width={64} tickFormatter={(v: number) => fmt.moneyCompact(String(v))} />
        <Tooltip
          cursor={{ fill: 'var(--xp-color-bg-muted)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as Row | undefined;
            if (!row) return null;
            return (
              <ChartTooltip
                title={row.label}
                rows={[
                  { key: 'money', label: moneyLabel, color: CHART_COLOR.revenue, raw: row.money },
                  {
                    key: 'count',
                    label: countLabel,
                    color: CHART_SERIES_COLORS[1],
                    raw: String(row.count),
                    text: fmt.count(row.count),
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="moneyValue"
          name={moneyLabel}
          fill={CHART_COLOR.revenue}
          radius={CHART_BAR_RADIUS}
          maxBarSize={22}
        />
      </BarChart>
    </ChartFrame>
  );
}
