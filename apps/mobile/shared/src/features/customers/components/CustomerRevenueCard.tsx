import { useState } from 'react';
import { isZeroMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { FactRow } from '@/components/ui/FactRow';
import { Pill } from '@/components/ui/Pill';
import { SectionHeader } from '@/components/ui/CardTitle';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;
import { useCustomerRevenue } from '../hooks/use-customers';
import type { CustomerBooking, CustomerRevenuePeriod } from '../api';

const PERIODS: readonly CustomerRevenuePeriod[] = ['week', 'month', 'quarter', 'year'];

/**
 * "Doanh thu từ khách" — bản native của khối đầu tab "Thu chi" (`CustomerFinanceTab` web,
 * 02/11/2026): kỳ tuần/tháng/quý/năm, khoản phải thu (mọi kỳ), thực thu trong kỳ, chuyến hoàn tất,
 * biểu đồ cột "Giá trị đơn theo ngày nhận xe" (dựng bằng View, mỗi cột một khoảng của kỳ) và danh
 * sách đơn còn nợ (cũ trước).
 *
 * Server đòi `finance.view` + `bookings.view`: nơi gọi chỉ dựng khi có cả hai.
 */
export function CustomerRevenueCard({ customerId }: { customerId: string }) {
  const t = useTranslations('Customers.profile.finance');
  const tHistory = useTranslations('Customers.profile.history');
  const tCommon = useTranslations('Common.actions');
  const colors = useColors();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const [period, setPeriod] = useState<CustomerRevenuePeriod>('month');
  const { data, isLoading, isError, error, refetch } = useCustomerRevenue(customerId, period);
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  // "Thu tiền" từng khoản — cùng cổng web `canCollect` (quyền ghi phiếu + năng lực sổ thu chi).
  const canCollect = permissions.has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;
  const [paying, setPaying] = useState<CustomerBooking | null>(null);

  return (
    <Card>
      <YStack gap={space.sm}>
        <SectionHeader icon="trending-up-outline">{t('title')}</SectionHeader>
        {/* Dải tab viên cuộn ngang - nhãn đủ chữ (người dùng 16/11/2026). */}
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
          <SkeletonText lines={3} />
        ) : (
          <>
            <YStack gap={2}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('receivable', { count: data?.receivableCount ?? 0 })}
              </Text>
              <Text col={colors.danger} fos={fontSize.h3} fow={fontWeight.bold}>
                {fmt.money(data?.receivableAmount ?? '0')}
              </Text>
            </YStack>
            <FactRow label={t('collected')}>{fmt.money(data?.collectedInPeriod ?? '0')}</FactRow>
            <FactRow label={t('completed')}>{fmt.count(data?.completedInPeriod ?? 0)}</FactRow>
            {/* Web `financeSummary`: nút "Thu tiền" chính - thu khoản nợ CŨ NHẤT (`receivables[0]`). */}
            {canCollect && data?.receivables[0] ? (
              <Button
                label={t('collect')}
                onPress={() => setPaying(data.receivables[0] ?? null)}
              />
            ) : null}

            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} pt={space.xs}>
              {t('chartTitle')}
            </Text>
            <RevenueBars buckets={data?.buckets ?? []} period={period} emptyLabel={t('chartEmpty')} />
            {/* Web `MoneyVolumeChart` có hai chuỗi tiền + số đơn; app ghi tổng số đơn của kỳ dưới cột. */}
            {data && !isZeroMoney(data.periodRevenue) ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {[
                  `${t('chartMoney')} ${fmt.money(data.periodRevenue)}`,
                  `${t('chartCount')} ${data.buckets.reduce((sum, bucket) => sum + bucket.count, 0)}`,
                ].join(LIST_SEPARATOR)}
              </Text>
            ) : null}

            <SectionHeader icon="wallet-outline">
              {t('receivablesTitle')}
            </SectionHeader>
            {(data?.receivables.length ?? 0) === 0 ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('receivablesEmpty')}
              </Text>
            ) : (
              data?.receivables.map((row) => (
                // Thẻ như web khổ hẹp / thẻ danh sách đơn: mã, các dòng nhãn-giá trị, nút Thu tiền.
                <YStack key={row.id} gap={space.sm} p={space.md} br={radius.md} bw={1} bc={colors.border}>
                  <XStack ai="center" jc="space-between" gap={space.sm}>
                    <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1} flexShrink={1}>
                      {row.code}
                    </Text>
                    <Pill label={t('unpaid')} tone="danger" />
                  </XStack>
                  <FactRow
                    label={t('colContent')}
                    sub={[row.vehiclePlate, fmt.date(row.pickupAt)].filter(Boolean).join(LIST_SEPARATOR)}
                  >
                    {row.vehicleName}
                  </FactRow>
                  <FactRow label={tHistory('colTime')} sub={`${tHistory('returnAt')} ${fmt.shortDateTime(row.returnAt)}`}>
                    {`${tHistory('pickupAt')} ${fmt.shortDateTime(row.pickupAt)}`}
                  </FactRow>
                  <FactRow label={tHistory('colTotal')}>{fmt.money(row.totalAmount)}</FactRow>
                  <FactRow label={t('colPaid')}>{fmt.money(row.paidAmount)}</FactRow>
                  <FactRow label={t('colDebt')} tone={colors.danger}>
                    {fmt.money(row.debtAmount)}
                  </FactRow>
                  {canCollect ? (
                    <Button label={t('collect')} variant="gradient" size="compact" onPress={() => setPaying(row)} />
                  ) : null}
                </YStack>
              ))
            )}
          </>
        )}
        {isError && data ? (
          <Button label={tCommon('retry')} variant="neutral" onPress={() => void refetch()} />
        ) : null}
      </YStack>
      {paying ? (
        <RecordPaymentSheet
          open
          onClose={() => setPaying(null)}
          bookingId={paying.id}
          debtAmount={paying.debtAmount ?? '0'}
        />
      ) : null}
    </Card>
  );
}

const BAR_AREA_HEIGHT = 120;
/** Cột không phình khi kỳ chỉ có vài khoảng (quý = 3 cột). */
const BAR_MAX_WIDTH = 28;
const Y_AXIS_WIDTH = 44;
const Y_TICKS = 4;

/**
 * Cột giá trị đơn theo khoảng của kỳ — bản gọn của `MoneyVolumeChart` web: trục dọc có giá trị
 * (rút gọn), lưới ngang mảnh, cột có bề rộng tối đa, nhãn trục ngang ngắn (quý/năm "MM/YYYY",
 * tuần/tháng "DD/MM") và ghi thưa khi nhiều khoảng để chữ không vỡ.
 */
function RevenueBars({
  buckets,
  period,
  emptyLabel,
}: {
  buckets: readonly { from: string; to: string; amount: string; count: number }[];
  period: CustomerRevenuePeriod;
  emptyLabel: string;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const max = buckets.reduce((m, b) => Math.max(m, Number(b.amount)), 0);
  if (buckets.length === 0 || max === 0) {
    return (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {emptyLabel}
      </Text>
    );
  }
  const byMonth = period === 'quarter' || period === 'year';
  const labelOf = (from: string) => (byMonth ? fmt.monthYearShort(new Date(from)) : fmt.dayMonth(from));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / (byMonth ? 4 : 6)));
  const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => (max * (Y_TICKS - i)) / Y_TICKS);

  return (
    <YStack gap={space.xs}>
      <XStack>
        <YStack w={Y_AXIS_WIDTH} h={BAR_AREA_HEIGHT + fontSize.meta} jc="space-between" mt={-fontSize.meta / 2}>
          {ticks.map((tick, i) => (
            <Text key={i} col={colors.textMuted} fos={fontSize.meta} lh={fontSize.meta} numberOfLines={1}>
              {fmt.moneyCompact(String(Math.round(tick)))}
            </Text>
          ))}
        </YStack>
        <YStack f={1} h={BAR_AREA_HEIGHT}>
          <YStack pos="absolute" top={0} bottom={0} left={0} right={0} jc="space-between">
            {ticks.map((_, i) => (
              <YStack key={i} h={1} bg={colors.borderSubtle} />
            ))}
          </YStack>
          <XStack f={1} ai="flex-end">
            {buckets.map((bucket) => {
              const value = Number(bucket.amount);
              return (
                <YStack key={bucket.from} f={1} ai="center" jc="flex-end" h="100%">
                  <YStack
                    w="70%"
                    maxWidth={BAR_MAX_WIDTH}
                    h={value > 0 ? Math.max(3, (value / max) * BAR_AREA_HEIGHT) : 0}
                    borderTopLeftRadius={4}
                    borderTopRightRadius={4}
                    bg={colors.primary}
                    accessibilityLabel={`${labelOf(bucket.from)}: ${fmt.money(bucket.amount)} · ${bucket.count}`}
                  />
                </YStack>
              );
            })}
          </XStack>
        </YStack>
      </XStack>
      <XStack paddingLeft={Y_AXIS_WIDTH}>
        {buckets.map((bucket, index) => (
          <YStack key={bucket.from} f={1} ai="center">
            {index % labelEvery === 0 ? (
              <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1} w={56} ta="center">
                {labelOf(bucket.from)}
              </Text>
            ) : null}
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}
