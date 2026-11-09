import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
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
  const tCommon = useTranslations('Common.actions');
  const colors = useColors();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const [period, setPeriod] = useState<CustomerRevenuePeriod>('month');
  const { data, isLoading, isError, error, refetch } = useCustomerRevenue(customerId, period);
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  // "Thu tiền" từng khoản — cùng cổng web `canCollect` (quyền ghi phiếu + năng lực sổ thu chi).
  const canCollect = permissions.has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;
  const [paying, setPaying] = useState<CustomerBooking | null>(null);

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('title')}</BlockTitle>
        <SegmentedTabs
          items={PERIODS.map((key) => ({ key, label: t(`period.${key}`) }))}
          value={period}
          onChange={setPeriod}
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
            <XStack gap={space.md}>
              <YStack f={1} gap={2}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('collected')}
                </Text>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {fmt.money(data?.collectedInPeriod ?? '0')}
                </Text>
              </YStack>
              <YStack f={1} gap={2}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('completed')}
                </Text>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {data?.completedInPeriod ?? 0}
                </Text>
              </YStack>
            </XStack>

            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('chartTitle')}
            </Text>
            <RevenueBars buckets={data?.buckets ?? []} period={period} emptyLabel={t('chartEmpty')} />

            <BlockTitle
              action={
                <BlockLink
                  label={t('ledgerLink')}
                  onPress={() =>
                    navigateOnce(ROUTES.manage.receipts({ tenantCustomerId: customerId }))
                  }
                />
              }
            >
              {t('receivablesTitle')}
            </BlockTitle>
            {(data?.receivables.length ?? 0) === 0 ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('receivablesEmpty')}
              </Text>
            ) : (
              data?.receivables.map((row) => (
                <XStack key={row.id} ai="center" gap={space.sm}>
                  <YStack f={1} gap={2}>
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {row.code} · {row.vehicleName}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {[row.vehiclePlate, fmt.date(row.pickupAt)].filter(Boolean).join(' · ')} ·{' '}
                      {t('colPaid')} {fmt.money(row.paidAmount)}
                    </Text>
                  </YStack>
                  <YStack ai="flex-end" gap={space.xs}>
                    <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.bold}>
                      {fmt.money(row.debtAmount)}
                    </Text>
                    {canCollect ? (
                      <Button
                        label={t('collect')}
                        variant="outline"
                        size="sm"
                        block={false}
                        onPress={() => setPaying(row)}
                      />
                    ) : null}
                  </YStack>
                </XStack>
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

const BAR_AREA_HEIGHT = 96;

/**
 * Cột giá trị đơn theo khoảng của kỳ — bản gọn của `MoneyVolumeChart` web. Cao cột tỉ lệ với cột
 * lớn nhất; nhãn trục theo cùng luật `bucketLabel` của web (quý/năm: tháng; tuần/tháng: ngày).
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
  const labelOf = (from: string) =>
    period === 'quarter' || period === 'year' ? fmt.monthYear(new Date(from)) : fmt.dayMonth(from);
  // Kỳ tháng có ~30 khoảng: chỉ ghi nhãn thưa để chữ không đè nhau.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));

  return (
    <YStack gap={space.xs}>
      <XStack h={BAR_AREA_HEIGHT} ai="flex-end" gap={2}>
        {buckets.map((bucket) => {
          const value = Number(bucket.amount);
          return (
            <YStack
              key={bucket.from}
              f={1}
              h={value > 0 ? Math.max(3, (value / max) * BAR_AREA_HEIGHT) : 2}
              br={2}
              bg={value > 0 ? colors.primary : colors.borderSubtle}
              accessibilityLabel={`${labelOf(bucket.from)}: ${fmt.money(bucket.amount)} · ${bucket.count}`}
            />
          );
        })}
      </XStack>
      <XStack gap={2}>
        {buckets.map((bucket, index) => (
          <Text
            key={bucket.from}
            f={1}
            col={colors.textMuted}
            fos={10}
            numberOfLines={1}
            ta="center"
          >
            {index % labelEvery === 0 ? labelOf(bucket.from) : ''}
          </Text>
        ))}
      </XStack>
    </YStack>
  );
}
