import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { isZeroMoney, LIST_SEPARATOR, toAppTz } from '@xeprime/domain';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { HorizontalScroller } from '@/components/ui/HorizontalScroller';
import { DashedDivider } from '@/components/ui/DashedDivider';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { useCustomerRevenue } from '../hooks/use-customers';
import type { CustomerBooking, CustomerRevenuePeriod } from '../api';

const PERIODS: readonly CustomerRevenuePeriod[] = ['week', 'month', 'quarter', 'year'];

/** Figma "Users / Details - Thu chi" `24494:25604`: đệm/khe 12 và 16, ô xám bo 10, thẻ khoản bo 12. */
const GAP = 12;
const TILE_RADIUS = 10;
const ROW_RADIUS = 12;
const BAR_AREA_HEIGHT = 120;
const BAR_WIDTH = 28;
/** Bề rộng cột nhãn của trục giá trị dọc ("281,2tr" ở cỡ nhãn 12). */
const AXIS_WIDTH = 42;
/** Bề rộng tối thiểu một cột; ít hơn thì vùng cột cuộn ngang. */
const MIN_COLUMN = 54;
/** Kéo hàng cột sát trục giá trị: nửa đệm của cột đầu làm khe trái hở quá. */
const COLUMN_SHIFT = 0;
const BAR_RADIUS = 6;
const LABEL_WIDTH = 54;

/**
 * Tab "Thu chi" của chi tiết khách (`CustomerFinanceTab` web) theo Figma `24494:25604`: dải chip kỳ
 * (tuần · tháng · quý · năm), thẻ "khoản phải thu" (+ nút Thu tiền thu khoản nợ CŨ NHẤT) kèm thực thu
 * và số chuyến hoàn tất, thẻ biểu đồ "Doanh thu (k VND)" và thẻ "Khoản phải thu" có link "Sổ Thu/Chi".
 *
 * Danh sách phiếu và khối doanh thu theo kỳ của sổ Thu-Chi (`CustomerFinancePanel`) Figma không vẽ nên
 * đã gỡ khỏi tab; link "Sổ Thu/Chi" mở sổ đã lọc theo khách (người dùng chốt 25/11/2026).
 *
 * Server đòi `finance.view` + `bookings.view`: nơi gọi chỉ dựng khi có cả hai.
 */
export function CustomerRevenueCard({ customerId }: { customerId: string }) {
  const t = useTranslations('Customers.profile.finance');
  const tApp = useTranslations('Customers.app.detail.finance');
  const tCommon = useTranslations('Common.actions');
  const colors = useColors();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const [period, setPeriod] = useState<CustomerRevenuePeriod>('week');
  // Cột biểu đồ đang chọn (chú giải): chạm BẤT KỲ đâu trong tab (kể cả bắt đầu cuộn) là tắt; `pickedAtTouch`
  // nhớ cột đang chọn lúc bắt đầu chạm để chạm lại ĐÚNG cột đó thì đóng thay vì mở lại.
  const [picked, setPicked] = useState<number | null>(null);
  const pickedAtTouch = useRef<number | null>(null);
  const { data, isLoading, isError, error, refetch } = useCustomerRevenue(customerId, period);
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  // "Thu tiền" - cùng cổng web `canCollect` (quyền ghi phiếu + năng lực sổ thu chi).
  const canCollect = permissions.has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;
  const [paying, setPaying] = useState<CustomerBooking | null>(null);

  const receivableAmount = data?.receivableAmount ?? '0';
  const owing = !isZeroMoney(receivableAmount);
  const oldest = data?.receivables[0] ?? null;

  const label = {
    col: colors.placeholder,
    fos: typeScale.label.fontSize,
    lh: typeScale.label.lineHeight,
  } as const;
  const tileValue = {
    col: colors.text,
    fos: typeScale.title.fontSize,
    lh: typeScale.title.lineHeight,
    fow: fontWeight.semibold,
  } as const;

  return (
    <View
      onTouchStart={() => {
        pickedAtTouch.current = picked;
        if (picked !== null) setPicked(null);
      }}
    >
    <YStack gap={space.lg}>
      {/* Chip kỳ: vẫn là CÙNG khoản phải thu/biểu đồ, chỉ đổi kỳ - lối tắt cho một bộ lọc, không phải mục khác. */}
      <ChipTabs
        label={t('title')}
        items={PERIODS.map((value) => ({ value, label: t(`period.${value}`) }))}
        value={period}
        onSelect={setPeriod}
        gutter={0}
      />

      {isError && !data ? (
        <Callout tone="danger" title={t('errorTitle')}>
          {errorMessage(error)}
        </Callout>
      ) : isLoading && !data ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : (
        <>
          <Card>
            <YStack gap={GAP}>
              <XStack
                ai="center"
                jc="space-between"
                gap={space.sm}
                p={GAP}
                br={radius.control}
                bw={owing ? 1 : 0}
                bc={colors.dangerBorder}
                bg={owing ? colors.dangerSurface : colors.background}
              >
                <YStack f={1} minWidth={0} gap={2}>
                  <Text {...label} col={colors.textMuted} numberOfLines={1}>
                    {tApp('receivable', { count: data?.receivableCount ?? 0 })}
                  </Text>
                  <Text
                    col={owing ? colors.dangerStrong : colors.text}
                    fos={typeScale.heading.fontSize}
                    lh={typeScale.heading.lineHeight}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {fmt.money(receivableAmount)}
                  </Text>
                </YStack>
                {/* Web `financeSummary`: nút "Thu tiền" chính - thu khoản nợ CŨ NHẤT (`receivables[0]`). */}
                {canCollect && oldest ? (
                  <Button
                    label={tApp('collect')}
                    variant="gradient"
                    size="compact"
                    onPress={() => setPaying(oldest)}
                  />
                ) : null}
              </XStack>

              <XStack gap={space.sm}>
                <YStack f={1} flexBasis={0} minWidth={0} gap={2} p={GAP} br={TILE_RADIUS} bg={colors.background}>
                  <Text {...tileValue} numberOfLines={1}>
                    {fmt.money(data?.collectedInPeriod ?? '0')}
                  </Text>
                  <Text {...label} numberOfLines={1}>
                    {tApp('collected')}
                  </Text>
                </YStack>
                <YStack f={1} flexBasis={0} minWidth={0} gap={2} p={GAP} br={TILE_RADIUS} bg={colors.background}>
                  <Text {...tileValue} numberOfLines={1}>
                    {fmt.count(data?.completedInPeriod ?? 0)}
                  </Text>
                  <Text {...label} numberOfLines={1}>
                    {tApp('completed')}
                  </Text>
                </YStack>
              </XStack>
            </YStack>
          </Card>

          <Card>
            <YStack gap={GAP}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.text}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {tApp('chartTitle')}
                </Text>
                <Text {...label} numberOfLines={1}>
                  {periodLabel(period, data?.buckets ?? [], fmt.dayMonth, {
                    month: (month, year) => tApp('periodMonth', { month, year }),
                    quarter: (quarter, year) => tApp('periodQuarter', { quarter, year }),
                    year: (year) => tApp('periodYear', { year }),
                    range: (from, to) => tApp('periodRange', { from, to }),
                  })}
                </Text>
              </XStack>
              <RevenueBars
                buckets={data?.buckets ?? []}
                period={period}
                emptyLabel={t('chartEmpty')}
                picked={picked}
                onPick={(index) => setPicked(pickedAtTouch.current === index ? null : index)}
              />
            </YStack>
          </Card>

          <Card>
            <YStack gap={GAP}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.text}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {tApp('receivablesTitle')}
                </Text>
                <Pressable
                  onPress={() => navigateOnce(ROUTES.manage.receipts({ tenantCustomerId: customerId }))}
                  accessibilityRole="link"
                  accessibilityLabel={tApp('ledger')}
                  hitSlop={8}
                >
                  <XStack ai="center" gap={6}>
                    <Text
                      col={colors.brandLink}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fow={fontWeight.semibold}
                    >
                      {tApp('ledger')}
                    </Text>
                    <LineIcon name="arrow-right" size={20} color={colors.brandShape} />
                  </XStack>
                </Pressable>
              </XStack>

              {(data?.receivables.length ?? 0) === 0 ? (
                <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {t('receivablesEmpty')}
                </Text>
              ) : (
                data?.receivables.map((row) => (
                  <XStack
                    key={row.id}
                    ai="center"
                    jc="space-between"
                    gap={space.sm}
                    px={GAP}
                    py={GAP}
                    br={ROW_RADIUS}
                    bg={colors.background}
                  >
                    <YStack f={1} minWidth={0} gap={2}>
                      <Text
                        col={colors.text}
                        fos={typeScale.label.fontSize}
                        lh={typeScale.label.lineHeight}
                        fow={fontWeight.semibold}
                        numberOfLines={1}
                      >
                        {[`#${row.code}`, row.vehicleName].filter(Boolean).join(LIST_SEPARATOR)}
                      </Text>
                      <Text {...label} numberOfLines={1}>
                        {fmt.date(row.pickupAt)}
                      </Text>
                    </YStack>
                    <YStack ai="flex-end" gap={3} flexShrink={0}>
                      {/* Figma "Receivable Details" 24494:25771: số tiền + viên "Chưa thu" cùng đỏ status/error-high, viên nền error-low. */}
                      <Text
                        col={colors.danger}
                        fos={typeScale.label.fontSize}
                        lh={typeScale.label.lineHeight}
                        fow={fontWeight.semibold}
                      >
                        {fmt.money(row.debtAmount)}
                      </Text>
                      <XStack bg={colors.dangerSurface} br={radius.pill} px={space.sm} py={3}>
                        <Text
                          col={colors.danger}
                          fos={typeScale.label.fontSize}
                          lh={typeScale.label.lineHeight}
                          fow={fontWeight.medium}
                        >
                          {tApp('unpaid')}
                        </Text>
                      </XStack>
                    </YStack>
                  </XStack>
                ))
              )}
            </YStack>
          </Card>
        </>
      )}

      {isError && data ? (
        <Button label={tCommon('retry')} variant="neutral" onPress={() => void refetch()} />
      ) : null}

      {paying ? (
        <RecordPaymentSheet
          open
          onClose={() => setPaying(null)}
          bookingId={paying.id}
          debtAmount={paying.debtAmount ?? '0'}
        />
      ) : null}
    </YStack>
    </View>
  );
}

type Bucket = { from: string; to: string; amount: string; count: number };

/** Chữ kỳ ở góc phải tiêu đề biểu đồ: "Tháng 10/2026" · "Quý 4/2026" · "Năm 2026" · "22/12 - 28/12". */
function periodLabel(
  period: CustomerRevenuePeriod,
  buckets: readonly Bucket[],
  dayMonth: (value: string) => string,
  text: {
    month: (month: string, year: string) => string;
    quarter: (quarter: number, year: string) => string;
    year: (year: string) => string;
    range: (from: string, to: string) => string;
  },
): string {
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (!first || !last) return '';
  const start = toAppTz(first.from);
  if (period === 'month') return text.month(start.format('MM'), start.format('YYYY'));
  if (period === 'quarter') {
    return text.quarter(Math.floor(start.month() / 3) + 1, start.format('YYYY'));
  }
  if (period === 'year') return text.year(start.format('YYYY'));
  return text.range(dayMonth(first.from), dayMonth(last.to));
}

/**
 * Cột giá trị đơn theo khoảng của kỳ - Figma "Revenue Chart" (bản app thêm trục giá trị dọc bên trái): cột rộng 28 bo trên, cột CAO
 * NHẤT tô vàng, các cột khác xám; nhãn dưới cột ("01-05" cho tuần/tháng, "MM/YYYY" cho quý/năm), ghi thưa
 * khi nhiều khoảng để chữ không vỡ. Giá trị từng cột vẫn có ở nhãn trợ năng.
 */
function RevenueBars({
  buckets,
  period,
  emptyLabel,
  picked,
  onPick,
}: {
  buckets: readonly Bucket[];
  period: CustomerRevenuePeriod;
  emptyLabel: string;
  picked: number | null;
  onPick: (index: number) => void;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const tApp = useTranslations('Customers.app.detail.finance');
  const [plotWidth, setPlotWidth] = useState(0);
  const max = buckets.reduce((m, b) => Math.max(m, Number(b.amount)), 0);
  if (buckets.length === 0 || max === 0) {
    return (
      <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {emptyLabel}
      </Text>
    );
  }
  const byMonth = period === 'quarter' || period === 'year';
  const labelOf = (bucket: Bucket) =>
    byMonth
      ? fmt.monthYearShort(new Date(bucket.from))
      : dayRangeLabel(bucket);
  // Trục giá trị DỌC bên trái (Figma không vẽ, người dùng 25/11/2026): 5 mốc 0 · 25% · 50% · 75% · 100% như web.
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((ratio) =>
    ratio === 0 ? '0' : fmt.moneyCompact(String(Math.round(max * ratio))),
  );

  /*
   * Nhiều cột (quý/năm: 12 tháng) thì bề ngang một cột nhỏ hơn `MIN_COLUMN` và nhãn đè nhau ⇒ vùng cột
   * CUỘN NGANG (trục giá trị đứng yên bên trái); ít cột thì chia đều vừa khung như cũ.
   */
  const viewport = Math.max(0, plotWidth - AXIS_WIDTH + COLUMN_SHIFT);
  const scrolls = viewport > 0 && buckets.length * MIN_COLUMN > viewport;
  const contentWidth = scrolls ? buckets.length * MIN_COLUMN : viewport;
  const columnWidth = buckets.length > 0 ? contentWidth / buckets.length : 0;
  const labelEvery = scrolls ? 1 : Math.max(1, Math.ceil(buckets.length / (byMonth ? 4 : 6)));

  const plot = (
    <YStack w={contentWidth}>
      {/* Vạch lưới nét đứt sau các cột. */}
      <YStack position="absolute" left={COLUMN_SHIFT} right={0} top={0} height={BAR_AREA_HEIGHT} pointerEvents="none">
        {ticks.map((_, i) => (
          <YStack key={i} position="absolute" left={0} right={0} top={(i * BAR_AREA_HEIGHT) / (ticks.length - 1)}>
            <DashedDivider color={colors.borderInput} />
          </YStack>
        ))}
      </YStack>
      <XStack>
        {buckets.map((bucket, index) => {
          const value = Number(bucket.amount);
          const top = value === max;
          return (
            <Pressable
              key={bucket.from}
              style={{ width: columnWidth }}
              onPress={() => onPick(index)}
              accessibilityRole="button"
              accessibilityLabel={`${labelOf(bucket)}: ${fmt.money(bucket.amount)} · ${bucket.count}`}
            >
              <YStack ai="center" gap={space.sm}>
                <YStack h={BAR_AREA_HEIGHT} jc="flex-end">
                  <YStack
                    w={BAR_WIDTH}
                    h={value > 0 ? Math.max(3, (value / max) * BAR_AREA_HEIGHT) : 0}
                    borderTopLeftRadius={BAR_RADIUS}
                    borderTopRightRadius={BAR_RADIUS}
                    bg={top || picked === index ? colors.brandShape : colors.surfaceMuted}
                  />
                </YStack>
                <YStack h={typeScale.label.lineHeight} ai="center" jc="center">
                  {index % labelEvery === 0 ? (
                    <Text
                      col={colors.placeholder}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                      numberOfLines={1}
                      w={LABEL_WIDTH}
                      ta="center"
                    >
                      {labelOf(bucket)}
                    </Text>
                  ) : null}
                </YStack>
              </YStack>
            </Pressable>
          );
        })}
      </XStack>
      {picked !== null && buckets[picked] && contentWidth > 0 ? (
        <ChartTip
          title={labelOf(buckets[picked] as Bucket)}
          money={tApp('chartMoney')}
          moneyValue={fmt.money((buckets[picked] as Bucket).amount)}
          count={tApp('chartCount')}
          countValue={String((buckets[picked] as Bucket).count)}
          centerX={(picked + 0.5) * columnWidth}
          barTop={BAR_AREA_HEIGHT - (Number((buckets[picked] as Bucket).amount) / max) * BAR_AREA_HEIGHT}
          width={contentWidth}
        />
      ) : null}
    </YStack>
  );

  return (
    <XStack onLayout={(event) => setPlotWidth(Math.round(event.nativeEvent.layout.width))}>
      <YStack w={AXIS_WIDTH}>
        {/* Cao hơn vùng cột đúng một dòng chữ và dịch lên nửa dòng: nhãn đỉnh/0 canh GIỮA vạch đỉnh/đáy cột. */}
        <YStack h={BAR_AREA_HEIGHT + typeScale.label.lineHeight} mt={-typeScale.label.lineHeight / 2} jc="space-between" ai="flex-end">
          {ticks.map((tick, i) => (
            <Text
              key={i}
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              numberOfLines={1}
            >
              {tick}
            </Text>
          ))}
        </YStack>
      </YStack>
      {scrolls ? (
        <YStack f={1} ml={-COLUMN_SHIFT}>
          <HorizontalScroller hintTop={BAR_AREA_HEIGHT / 2 - 16}>{plot}</HorizontalScroller>
        </YStack>
      ) : (
        <YStack f={1} ml={-COLUMN_SHIFT}>
          {plot}
        </YStack>
      )}
    </XStack>
  );
}

/**
 * Nhãn ngày của một khoảng tuần/tháng: một ngày thì `23/11`, nhiều ngày thì `23 - 24/11`. Mốc `to` có thể là 00:00 của
 * ngày KẾ (khoảng nửa mở) nên lùi 1ms trước khi so - nếu không cột một ngày bị ghi thành `23 - 24/11`.
 */
function dayRangeLabel(bucket: Bucket): string {
  const start = toAppTz(bucket.from);
  const end = toAppTz(bucket.to).subtract(1, 'millisecond');
  if (end.isBefore(start, 'day') || end.isSame(start, 'day')) return start.format('DD/MM');
  return `${start.format('DD')} - ${end.format('DD/MM')}`;
}

/** Chú giải của cột đang chạm: nhãn khoảng · Giá trị đơn · Số đơn (như tooltip web). Nổi trên cột, không bắt chạm. */
const TIP_WIDTH = 168;
const TIP_HEIGHT = 74;
function ChartTip({
  title,
  money,
  moneyValue,
  count,
  countValue,
  centerX,
  barTop,
  width,
}: {
  title: string;
  money: string;
  moneyValue: string;
  count: string;
  countValue: string;
  centerX: number;
  barTop: number;
  width: number;
}) {
  const colors = useColors();
  // Đủ chỗ phía trên cột ⇒ đặt trên cột. Cột cao sát đỉnh ⇒ đặt CẠNH cột (phải, hết chỗ thì trái) để không che cột.
  const roomAbove = barTop - TIP_HEIGHT - space.xs >= 0;
  const clamp = (x: number) => Math.min(Math.max(0, x), Math.max(0, width - TIP_WIDTH));
  const sideRight = centerX + BAR_WIDTH / 2 + space.sm;
  const left = roomAbove
    ? clamp(centerX - TIP_WIDTH / 2)
    : sideRight + TIP_WIDTH <= width
      ? sideRight
      : clamp(centerX - BAR_WIDTH / 2 - space.sm - TIP_WIDTH);
  const top = roomAbove ? barTop - TIP_HEIGHT - space.xs : 0;
  return (
    <YStack
      position="absolute"
      left={left}
      top={top}
      w={TIP_WIDTH}
      p={space.sm}
      gap={2}
      bg={colors.surface}
      br={radius.md}
      bw={1}
      bc={colors.border}
      pointerEvents="none"
    >
      <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold}>
        {title}
      </Text>
      <XStack jc="space-between" gap={space.sm}>
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {money}
        </Text>
        <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold}>
          {moneyValue}
        </Text>
      </XStack>
      <XStack jc="space-between" gap={space.sm}>
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {count}
        </Text>
        <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.semibold}>
          {countValue}
        </Text>
      </XStack>
    </YStack>
  );
}
