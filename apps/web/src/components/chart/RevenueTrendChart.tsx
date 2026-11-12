'use client';

import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
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
import styles from './RevenueTrendChart.module.css';

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
  /**
   * `chart` — chú giải của recharts dưới vùng vẽ (mặc định, các khối nhúng).
   * `none` — màn tự đặt `RevenueTrendLegend` ở chỗ khác (design Tổng quan doanh thu để nó cạnh
   * nút chọn độ mịn).
   */
  legend?: 'chart' | 'none';
  /**
   * `compact` — nhãn trục dạng `12,7tr` (mặc định).
   * `million` — trục ghi số TRIỆU trần kèm tên đơn vị dọc trục, như design Tổng quan doanh thu.
   */
  yAxis?: 'compact' | 'million';
  /** Lớp bổ sung cho khung — màn dùng để đặt kiểu thẻ của design. */
  className?: string;
}

const MILLION = 1_000_000;

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
  legend = 'chart',
  yAxis = 'compact',
  className,
}: RevenueTrendChartProps) {
  const t = useTranslations('Finance.overview.chart');
  const fmt = useAppFormat();
  // id của gradient phải duy nhất trên trang (hai biểu đồ cùng màn không được dùng chung `<defs>`),
  // và `useId` trả `:r1:` — dấu `:` làm hỏng `url(#…)` nên bỏ đi.
  const gradientId = useId().replace(/:/g, '');
  const revenueFill = `url(#${gradientId}-revenue)`;
  const costFill = `url(#${gradientId}-cost)`;

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
      className={className}
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
        {/* Cột đậm dần về chân (design): đầu cột nhạt hơn một bậc, chân là màu vai đầy đủ. */}
        <defs>
          <linearGradient id={`${gradientId}-revenue`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLOR.revenue} stopOpacity={0.78} />
            <stop offset="100%" stopColor={CHART_COLOR.revenue} stopOpacity={1} />
          </linearGradient>
          <linearGradient id={`${gradientId}-cost`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLOR.cost} stopOpacity={0.78} />
            <stop offset="100%" stopColor={CHART_COLOR.cost} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={16} />
        {/*
          Trục tiền dùng dạng RÚT GỌN (`12,7tr`): số đầy đủ chiếm hết chiều ngang và đẩy vùng vẽ
          co lại. Số đầy đủ vẫn có ở tooltip và ở thẻ tổng phía trên.
        */}
        {yAxis === 'million' ? (
          <YAxis
            {...CHART_AXIS}
            width={56}
            tickFormatter={(v: number) => fmt.measure(v / MILLION)}
            label={{
              value: t('yAxisUnit'),
              angle: -90,
              position: 'insideLeft',
              className: styles.axisUnit,
            }}
          />
        ) : (
          <YAxis {...CHART_AXIS} width={64} tickFormatter={(v: number) => fmt.moneyCompact(String(v))} />
        )}
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
        {legend === 'chart' ? <Legend iconType="circle" iconSize={8} /> : null}
        <Bar
          dataKey="revenueValue"
          name={t('revenue')}
          fill={revenueFill}
          radius={CHART_BAR_RADIUS}
          maxBarSize={yAxis === 'million' ? 40 : 28}
        />
        <Bar
          dataKey="costValue"
          name={t('cost')}
          fill={costFill}
          radius={CHART_BAR_RADIUS}
          maxBarSize={yAxis === 'million' ? 40 : 28}
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

/**
 * Chú giải ba vai của `RevenueTrendChart`, đặt ngoài vùng vẽ — khi biểu đồ dùng `legend="none"`.
 *
 * Cùng nhãn, cùng màu với chú giải của recharts: hai cách vẽ một chú giải mà lệch màu nhau là
 * hai biểu đồ nói hai điều khác nhau về cùng một series.
 */
export function RevenueTrendLegend() {
  const t = useTranslations('Finance.overview.chart');
  const items = [
    { key: 'revenue', label: t('revenue'), className: styles.swatchRevenue },
    { key: 'cost', label: t('cost'), className: styles.swatchCost },
    { key: 'profit', label: t('profit'), className: styles.swatchProfit },
  ];
  return (
    <ul className={styles.legend} aria-label={t('legend')}>
      {items.map((item) => (
        <li key={item.key} className={styles.legendItem}>
          <span className={item.className} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
