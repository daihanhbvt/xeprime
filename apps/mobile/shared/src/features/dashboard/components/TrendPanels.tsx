import type { UseQueryResult } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DASHBOARD_TREND_MONTHS, FINANCE_GRANULARITY } from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { RevenueTrendChart } from '@/features/finance/components/RevenueTrendChart';
import { useBucketLabels } from '@/features/finance/hooks/use-bucket-labels';
import type { FinanceSeries } from '@/features/finance/api';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { DASHBOARD_REVENUE_DAYS, type PartnerTrendPoint } from '../api';
import { DashboardPanel } from './DashboardPanel';

/**
 * Doanh thu `DASHBOARD_REVENUE_DAYS` ngày qua — dùng LẠI `RevenueTrendChart` của màn Tổng quan
 * doanh thu (gifted-charts đã có trong app), cùng chuỗi `/finance/series` theo ngày, cùng khoá
 * cache. Không thêm thư viện biểu đồ nào.
 */
export function RevenueTrendPanel({ series }: { series: UseQueryResult<FinanceSeries> }) {
  const t = useTranslations('Dashboard.charts');
  const { labelOf, titleOf } = useBucketLabels(FINANCE_GRANULARITY.DAY);
  const buckets = series.data?.buckets ?? [];
  const empty =
    series.data !== undefined && buckets.every((b) => isZeroMoney(b.revenue) && isZeroMoney(b.cost));

  return (
    <DashboardPanel
      title={t('revenueTitle', { days: DASHBOARD_REVENUE_DAYS })}
      icon="bar-chart"
      tone="success"
      loading={series.isPending}
      error={series.isError && !series.data}
      onRetry={() => void series.refetch()}
    >
      {series.data ? (
        <YStack px={space.md} py={space.sm} gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('revenueDescription')}
          </Text>
          {empty ? (
            <YStack gap={space.xs} py={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm}>
                {t('revenueEmpty', { days: DASHBOARD_REVENUE_DAYS })}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('revenueEmptyHint')}
              </Text>
            </YStack>
          ) : (
            <RevenueTrendChart buckets={buckets} labelOf={labelOf} titleOf={titleOf} />
          )}
        </YStack>
      ) : null}
    </DashboardPanel>
  );
}

const BAR_HEIGHT = 8;
/** Cột nhãn tháng bên trái mỗi hàng. */
const MONTH_LABEL_WIDTH = 64;
/** Cột số bên phải mỗi thanh. */
const BAR_VALUE_WIDTH = 28;
/** Neo GIỮA tháng, giữa ngày (UTC) để `period` YYYY-MM không lệch sang tháng khác ở bất kỳ múi giờ nào. */
const monthAnchor = (period: string) => new Date(`${period}-15T12:00:00Z`);

/**
 * Đơn mới và chuyến hoàn thành `DASHBOARD_TREND_MONTHS` tháng gần nhất — chỉ tuyến gói có sổ tổng
 * hợp (server trả `trend = null` cho phần còn lại, ADR 0027 điều 1).
 *
 * Trên web là biểu đồ cột đôi; trên màn hẹp, sáu tháng × hai chuỗi trình bày gọn hơn thành sáu
 * HÀNG, mỗi hàng hai thanh ngang có ghi số — đọc được con số mà không cần chạm từng cột, và không
 * cần thêm một loại biểu đồ mới vào app. Thang chung cho cả hai chuỗi để hai thanh so được với nhau.
 */
export function TripsTrendPanel({
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
  const empty = trend !== undefined && trend.every((p) => p.newBookings === 0 && p.completedTrips === 0);
  const max = Math.max(1, ...(trend ?? []).flatMap((p) => [p.newBookings, p.completedTrips]));

  return (
    <DashboardPanel
      title={t('tripsTitle', { months: DASHBOARD_TREND_MONTHS })}
      icon="stats-chart"
      tone="info"
      loading={!trend && loading}
      error={!trend && isError}
      onRetry={onRetry}
    >
      {trend ? (
        <YStack px={space.md} py={space.sm} gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('tripsDescription')}
          </Text>
          {empty ? (
            <Text col={colors.text} fos={fontSize.bodySm} py={space.sm}>
              {t('tripsEmpty', { months: DASHBOARD_TREND_MONTHS })}
            </Text>
          ) : (
            <>
              <XStack gap={space.md}>
                <Legend color={colors.info} label={t('newBookings')} />
                <Legend color={colors.success} label={t('completedTrips')} />
              </XStack>
              {trend.map((point) => (
                <XStack key={point.period} ai="center" gap={space.sm}>
                  <Text w={MONTH_LABEL_WIDTH} col={colors.textMuted} fos={fontSize.label}>
                    {fmt.monthYear(monthAnchor(point.period))}
                  </Text>
                  <YStack f={1} gap={3}>
                    <Bar value={point.newBookings} max={max} color={colors.info} />
                    <Bar value={point.completedTrips} max={max} color={colors.success} />
                  </YStack>
                </XStack>
              ))}
            </>
          )}
        </YStack>
      ) : null}
    </DashboardPanel>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack w={10} h={10} br={radius.sm} bg={color} />
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
    </XStack>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const fmt = useAppFormat();
  const percent = Math.round((value / max) * 100);
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack f={1} h={BAR_HEIGHT} br={radius.pill} bg={colors.surfaceMuted} overflow="hidden">
        <YStack w={`${percent}%`} h={BAR_HEIGHT} br={radius.pill} bg={color} />
      </YStack>
      <Text w={BAR_VALUE_WIDTH} ta="right" col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
        {fmt.count(value)}
      </Text>
    </XStack>
  );
}
