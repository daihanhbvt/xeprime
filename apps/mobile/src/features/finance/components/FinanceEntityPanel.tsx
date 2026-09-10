import { useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FINANCE_GRANULARITY,
  FINANCE_GRANULARITY_VALUES,
  RECEIPT_STATUS,
  type FinanceGranularity,
} from '@xeprime/types';
import { buildPeriodRange, isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { InlineAction } from '@/components/ui/InlineAction';
import { Chip } from '@/components/ui/Chip';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import { FINANCE_OVERVIEW_DEFAULT_PERIOD, FINANCE_OVERVIEW_PERIOD_VALUES } from '../constants';
import { useFinanceSeries, useFinanceSummary } from '../hooks/use-finance';
import { FinancePeriodBar } from './FinancePeriodBar';
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
  canCreateReceipt = false,
}: {
  /** Đúng MỘT khoá được đặt — panel không dựng để cắt hai chiều cùng lúc. */
  scope: FinanceScope;
  kind: 'vehicle' | 'customer';
  /**
   * Người đang xem có quyền ghi phiếu không — quyết định lối "Tạo phiếu thu/chi" có mặt hay không.
   *
   * Chỉ có nghĩa với `kind='vehicle'`: một khoản thu/chi gắn thẳng vào KHÁCH không tồn tại trong
   * sổ — tiền của khách luôn đi qua một chuyến.
   */
  canCreateReceipt?: boolean;
}) {
  const t = useTranslations('Finance.entity');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const [range, setRange] = useState(() => buildPeriodRange(FINANCE_OVERVIEW_DEFAULT_PERIOD));
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

  const cells: StatCell[] = data
    ? kind === 'vehicle'
      ? [
          {
            key: 'revenue',
            icon: 'trending-up-outline',
            label: t('revenue'),
            value: fmt.money(data.revenue),
            tone: colors.success,
            valueTone: colors.success,
          },
          {
            key: 'cost',
            icon: 'trending-down-outline',
            label: t('cost'),
            value: fmt.money(data.cost),
            tone: colors.danger,
            valueTone: colors.danger,
          },
          {
            key: 'profit',
            icon: 'wallet-outline',
            label: t('profit'),
            value: fmt.money(data.profit),
            tone: colors.primaryActive,
            /* `null` = chưa có doanh thu để tính biên — khác hẳn "biên 0%" (hoà vốn). */
            hint:
              data.profitMarginPercent == null
                ? t('marginUnknown')
                : t('margin', { value: data.profitMarginPercent }),
            ...(isNegativeMoney(data.profit) ? { valueTone: colors.danger } : {}),
          },
          {
            key: 'trips',
            icon: 'car-outline',
            label: t('trips'),
            value: fmt.count(data.trips),
            tone: colors.info,
          },
        ]
      : [
          {
            key: 'revenue',
            icon: 'trending-up-outline',
            label: t('revenue'),
            value: fmt.money(data.revenue),
            tone: colors.success,
            valueTone: colors.success,
          },
          {
            key: 'debt',
            icon: 'alert-circle-outline',
            label: t('debt'),
            value: fmt.money(data.totalDebt),
            tone: colors.warning,
            hint: t('debtBookings', { count: data.debtBookings }),
            ...(isZeroMoney(data.totalDebt) ? {} : { valueTone: colors.danger }),
          },
          {
            key: 'trips',
            icon: 'car-outline',
            label: t('trips'),
            value: fmt.count(data.trips),
            tone: colors.info,
          },
        ]
    : [];

  return (
    <YStack gap={space.md}>
      <BlockTitle>{t(`title.${kind}`)}</BlockTitle>

      <FinancePeriodBar
        periods={FINANCE_OVERVIEW_PERIOD_VALUES}
        from={range.from}
        to={range.to}
        onChange={setRange}
        customRange={false}
      />

      {summary.isError && !data ? (
        <ScreenError
          error={summary.error}
          title={t('error')}
          onRetry={() => void summary.refetch()}
        />
      ) : !data ? (
        <SkeletonText lines={3} />
      ) : (
        <Card padded={false}>
          <StatGrid cells={cells} columns={2} />
        </Card>
      )}

      {/* Tiêu đề biểu đồ — web đặt nó trên khung biểu đồ, giữ nguyên ở đây. */}
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('chartTitle')}
      </Text>

      {/* Ba tab của web, giữ nguyên hình thái "một cú bấm là đổi". */}
      <XStack gap={space.xs} flexWrap="wrap" accessibilityLabel={t('every.label')}>
        {granularityOptions.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={granularity === option.value}
            size="sm"
            onPress={() => setGranularity(option.value)}
          />
        ))}
      </XStack>

      {series.isError && !series.data ? (
        <ScreenError
          error={series.error}
          title={t('chartError')}
          onRetry={() => void series.refetch()}
        />
      ) : series.isLoading && !series.data ? (
        <SkeletonText lines={5} />
      ) : seriesEmpty || !series.data || series.data.buckets.length === 0 ? (
        <ScreenMessage
          icon="stats-chart-outline"
          title={t('chartEmpty')}
          description={t('chartEmptyHint')}
        />
      ) : (
        <RevenueTrendChart buckets={series.data.buckets} labelOf={labelOf} titleOf={titleOf} />
      )}

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t(`note.${kind}`)}
      </Text>

      {/*
        Ghi một khoản THẲNG cho chiếc xe này — phí rửa, vá lốp, gửi bãi không thuộc chuyến nào,
        nên nếu không có lối này thì chúng chỉ ghi được bằng cách mở sổ rồi tự tìm lại đúng chiếc
        xe vừa xem.

        KHÔNG đi kèm khoảng kỳ: kỳ đang xem là bộ lọc để ĐỌC, còn phiếu sắp ghi thì mặc định là
        hôm nay. Mang `from`/`to` sang sẽ khiến sổ mở ra không chứa chính phiếu vừa tạo.
      */}
      {kind === 'vehicle' && scope.vehicleId && canCreateReceipt ? (
        <InlineAction
          label={t('createReceipt')}
          onPress={() =>
            navigateOnce(ROUTES.manage.receipts({ vehicleId: scope.vehicleId, create: true }))
          }
        />
      ) : null}

      <InlineAction
        label={t('openLedger')}
        onPress={() =>
          navigateOnce(
            ROUTES.manage.receipts({
              ...scope,
              status: RECEIPT_STATUS.APPROVED,
              // CHỈ hai đầu kỳ — `granularity` là chuyện của biểu đồ, sổ không hiểu nó.
              from: range.from,
              to: range.to,
            }),
          )
        }
      />
    </YStack>
  );
}
