import { useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  type FinanceGranularity,
} from '@xeprime/types';
import { buildPeriodRange, isNegativeMoney, isZeroMoney, type PeriodKey } from '@xeprime/domain';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { Card } from '@/components/ui/Card';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import { FINANCE_OVERVIEW_DEFAULT_PERIOD, FINANCE_OVERVIEW_PERIOD_VALUES } from '../constants';
import { useFinanceSeries, useFinanceSummary } from '../hooks/use-finance';
import { RevenueTrendChart } from './RevenueTrendChart';
import { useBucketLabels } from '../hooks/use-bucket-labels';
import type { FinanceScope } from '../api';

/**
 * Khối TIỀN của một thực thể — bản native của `FinanceEntityPanel`, nhúng vào hồ sơ xe và hồ sơ
 * khách.
 *
 * Dùng lại nguyên bộ endpoint của màn Tổng quan doanh thu, chỉ thêm mệnh đề thu hẹp. Đó là điều
 * làm cho con số ở đây và con số ở bảng tổng quan **không thể lệch nhau** — chúng là cùng một
 * câu truy vấn. Viết một endpoint riêng cho "doanh thu một chiếc xe" sẽ là bản thứ hai của cùng
 * phép tính, và bản thứ hai luôn trôi khỏi bản đầu.
 *
 * `kind` quyết định BỘ SỐ hiện ra, không phải chỉ nhãn. Một chiếc xe có chi phí (bảo dưỡng, xăng)
 * nên nói được lãi/lỗ. Một khách hàng thì không: chi phí của gian hàng không gắn vào khách, nên
 * "Chi phí 0 ₫ · Lợi nhuận = Doanh thu" chỉ là hai ô nhiễu giả vờ mang thông tin. Thay vào đó
 * khách hiện phần thực sự của họ: còn nợ.
 *
 * Kỳ sống ở state màn hình chứ không ở URL — app native không có URL để chia sẻ (ADR 0004).
 *
 * Gác quyền `finance.view` ở NƠI GỌI: khối này là một bảng số, và kéo `usePermissions` vào nó
 * khiến mọi nơi nhúng nó phải dựng thêm ngữ cảnh chỉ để hiện một con số. Nơi gọi vốn đã phải
 * kiểm quyền để quyết định có dựng khối này hay không.
 */
export function FinanceEntityPanel({
  scope,
  kind,
}: {
  /** Đúng MỘT khoá được đặt — panel không dựng để cắt hai chiều cùng lúc. */
  scope: FinanceScope;
  kind: 'vehicle' | 'customer';
}) {
  const colors = useColors();
  const t = useTranslations('Finance.entity');
  const tPeriods = useTranslations('Finance.entity.periods');
  const fmt = useAppFormat();

  const [period, setPeriod] = useState<PeriodKey>(FINANCE_OVERVIEW_DEFAULT_PERIOD);
  const range = useMemo(() => buildPeriodRange(period), [period]);
  const [granularity, setGranularity] = useState<FinanceGranularity>(FINANCE_GRANULARITY.DAY);

  const filters = useMemo(() => ({ ...range, granularity }), [range, granularity]);

  const summary = useFinanceSummary(filters, scope);
  const series = useFinanceSeries(filters, scope);

  const granularityOptions = useMemo(
    () => FINANCE_GRANULARITY_VALUES.map((value) => ({ value, label: t(`every.${value}`) })),
    [t],
  );

  /*
   * Nhãn cột theo ĐỘ MỊN THẬT server đã dùng — kỳ dài bị hạ xuống `month` mà nhãn vẫn in ngày
   * thì mỗi cột nói dối về khoảng nó đại diện.
   */
  const actualGranularity = (series.data?.granularity ?? granularity) as FinanceGranularity;
  const { labelOf, titleOf } = useBucketLabels(actualGranularity);

  const seriesEmpty =
    series.data !== undefined &&
    series.data.buckets.every((bucket) => isZeroMoney(bucket.revenue) && isZeroMoney(bucket.cost));

  const data = summary.data;

  /*
   * Ô số theo khuôn tab "Thu chi" của Khách hàng (Figma `24494:25604`): ô nền `bg/gray-50` bo 10 đệm 12,
   * số 16/24 đậm trên nhãn 12/18 (người dùng chốt 26/11/2026).
   */
  const tiles: { key: string; label: string; value: string; tone?: string; hint?: string }[] = data
    ? kind === 'vehicle'
      ? [
          { key: 'revenue', label: t('revenue'), value: fmt.money(data.revenue), tone: colors.success },
          { key: 'cost', label: t('cost'), value: fmt.money(data.cost), tone: colors.danger },
          {
            key: 'profit',
            label: t('profit'),
            value: fmt.money(data.profit),
            tone: isNegativeMoney(data.profit) ? colors.danger : colors.text,
            /* `null` = chưa có doanh thu để tính biên — khác hẳn "biên 0%" (hoà vốn). */
            hint:
              data.profitMarginPercent == null
                ? t('marginUnknown')
                : t('margin', { value: data.profitMarginPercent }),
          },
          { key: 'trips', label: t('trips'), value: fmt.count(data.trips) },
        ]
      : [
          { key: 'revenue', label: t('revenue'), value: fmt.money(data.revenue), tone: colors.success },
          {
            key: 'debt',
            label: t('debt'),
            value: fmt.money(data.totalDebt),
            ...(isZeroMoney(data.totalDebt) ? {} : { tone: colors.danger }),
            hint: t('debtBookings', { count: data.debtBookings }),
          },
          { key: 'trips', label: t('trips'), value: fmt.count(data.trips) },
        ]
    : [];

  const label = { col: colors.placeholder, fos: typeScale.label.fontSize, lh: typeScale.label.lineHeight } as const;

  return (
    <YStack gap={space.lg}>
      {/* Chip kỳ - cùng một bộ số, chỉ đổi kỳ (khuôn Khách hàng › Thu chi). */}
      <ChipTabs
        label={t(`title.${kind}`)}
        items={FINANCE_OVERVIEW_PERIOD_VALUES.map((value) => ({ value, label: tPeriods(value) }))}
        value={period}
        onSelect={setPeriod}
        gutter={0}
      />

      {summary.isError && !data ? (
        <ScreenError error={summary.error} title={t('error')} onRetry={() => void summary.refetch()} />
      ) : !data ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : (
        <Card>
          <XStack flexWrap="wrap" gap={space.sm}>
            {tiles.map((tile) => (
              <YStack key={tile.key} w="48.5%" flexGrow={1} gap={2} p={TILE_PAD} br={TILE_RADIUS} bg={colors.background}>
                <Text
                  col={tile.tone ?? colors.text}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {tile.value}
                </Text>
                <Text {...label} numberOfLines={1}>
                  {tile.label}
                </Text>
                {tile.hint ? (
                  <Text {...label} numberOfLines={1}>
                    {tile.hint}
                  </Text>
                ) : null}
              </YStack>
            ))}
          </XStack>
        </Card>
      )}

      <Card>
        <YStack gap={TILE_PAD}>
          <Text
            col={colors.text}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {t('chartTitle')}
          </Text>
          <SegmentedTabs
            items={granularityOptions.map((option) => ({ key: option.value, label: option.label }))}
            value={granularity}
            onChange={setGranularity}
            variant="neutral"
          />
          {series.isError && !series.data ? (
            <ScreenError error={series.error} title={t('chartError')} onRetry={() => void series.refetch()} />
          ) : series.isLoading && !series.data ? (
            <SkeletonText lines={5} />
          ) : seriesEmpty || !series.data || series.data.buckets.length === 0 ? (
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('chartEmpty')}
            </Text>
          ) : (
            <RevenueTrendChart buckets={series.data.buckets} labelOf={labelOf} titleOf={titleOf} />
          )}
          <Text {...label}>{t(`note.${kind}`)}</Text>
        </YStack>
      </Card>
      {/* "Tạo phiếu thu/chi" và "Xem trên sổ Thu/Chi" đã gỡ (người dùng chốt 26/11/2026). */}
    </YStack>
  );
}

/** Khuôn Khách hàng › Thu chi: ô bo 10, đệm 12. */
const TILE_RADIUS = 10;
const TILE_PAD = 12;
