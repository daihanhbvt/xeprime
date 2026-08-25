'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppFormat } from '@/i18n/use-app-format';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip, type TooltipRow } from './ChartTooltip';
import {
  CHART_AXIS,
  CHART_BAR_RADIUS,
  CHART_COLOR,
  CHART_DOT_RADIUS,
  CHART_GRID,
  CHART_LINE_WIDTH,
} from './chart-theme';
import { toChartValue } from './chart-data';

/** Một cột của biểu đồ — tiền vẫn là CHUỖI ở đây; quy đổi sang số xảy ra bên trong. */
export interface TrendPoint {
  bucket: string;
  revenue: string;
  cost: string;
  profit: string;
}

interface RevenueTrendChartProps {
  points: readonly TrendPoint[];
  /** Nhãn trục X đã dựng sẵn theo độ mịn — component không tự đoán ngày. */
  labelOf: (bucket: string) => string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Chiều cao vùng vẽ. Khối nhúng trong hồ sơ xe/khách thấp hơn biểu đồ chính của màn tổng quan. */
  height?: number;
  loading?: boolean;
  error?: { title: string; onRetry?: () => void } | null;
  empty?: { title: string; description?: string } | null;
}

interface Row extends TrendPoint {
  label: string;
  revenueValue: number;
  costValue: number;
  profitValue: number;
}

/**
 * Doanh thu · Chi phí · Lợi nhuận theo thời gian.
 *
 * **Một trục Y duy nhất.** Cả ba series là tiền VND cùng thang, nên chúng so sánh được trực tiếp;
 * hai trục Y là cách nhanh nhất để vẽ ra một tương quan không tồn tại.
 *
 * Doanh thu và Chi phí là CỘT (hai đại lượng độc lập, đọc theo chiều cao); Lợi nhuận là ĐƯỜNG vì
 * nó là hiệu của hai cột kia — vẽ nó thành cột thứ ba mời người đọc cộng cả ba lại, trong khi
 * cột thứ ba đã nằm sẵn trong hai cột đầu.
 *
 * Lợi nhuận âm nằm dưới đường 0 — `ReferenceLine` không cần thiết vì trục Y tự cắt qua 0 khi có
 * giá trị âm, và thêm một đường nữa chỉ làm dày phần nền.
 */
export function RevenueTrendChart({
  points,
  labelOf,
  title,
  description,
  actions,
  height,
  loading,
  error,
  empty,
}: RevenueTrendChartProps) {
  const t = useTranslations('Finance.overview.chart');
  const fmt = useAppFormat();

  const rows: Row[] = points.map((p) => ({
    ...p,
    label: labelOf(p.bucket),
    revenueValue: toChartValue(p.revenue),
    costValue: toChartValue(p.cost),
    profitValue: toChartValue(p.profit),
  }));

  const series = [
    { key: 'revenue', dataKey: 'revenueValue', label: t('revenue'), color: CHART_COLOR.revenue },
    { key: 'cost', dataKey: 'costValue', label: t('cost'), color: CHART_COLOR.cost },
    { key: 'profit', dataKey: 'profitValue', label: t('profit'), color: CHART_COLOR.profit },
  ] as const;

  return (
    <ChartFrame
      title={title}
      description={description}
      actions={actions}
      height={height}
      loading={loading}
      error={error}
      empty={empty}
    >
      {/* `barGap` 2px là khe nền giữa hai cột cùng nhóm — hai mảng màu dính nhau đọc thành một. */}
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={16} />
        {/*
          Trục tiền dùng dạng RÚT GỌN (`12,7tr`): số đầy đủ chiếm hết chiều ngang và đẩy vùng vẽ
          co lại. Số đầy đủ vẫn có ở tooltip và ở thẻ tổng phía trên.
        */}
        <YAxis {...CHART_AXIS} width={64} tickFormatter={(v: number) => fmt.moneyCompact(String(v))} />
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
              raw: row[s.key],
            }));
            return <ChartTooltip title={row.label} rows={tooltipRows} />;
          }}
        />
        <Legend iconType="circle" iconSize={8} />
        <Bar
          dataKey="revenueValue"
          name={t('revenue')}
          fill={CHART_COLOR.revenue}
          radius={CHART_BAR_RADIUS}
          maxBarSize={28}
        />
        <Bar
          dataKey="costValue"
          name={t('cost')}
          fill={CHART_COLOR.cost}
          radius={CHART_BAR_RADIUS}
          maxBarSize={28}
        />
        <Line
          type="monotone"
          dataKey="profitValue"
          name={t('profit')}
          stroke={CHART_COLOR.profit}
          strokeWidth={CHART_LINE_WIDTH}
          dot={{ r: CHART_DOT_RADIUS, strokeWidth: 0, fill: CHART_COLOR.profit }}
          activeDot={{ r: CHART_DOT_RADIUS + 2 }}
        />
      </ComposedChart>
    </ChartFrame>
  );
}
