import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatCardFooter, StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { FinancePeriodFilters, FinanceSummary } from '../api';

/**
 * Sáu thẻ số liệu đầu màn Tổng quan doanh thu — bản native của `FinanceOverviewCards` (web, PR #276,
 * design Partner-XePrime): Doanh thu · Chi phí · Lợi nhuận · Dòng tiền ròng · Cọc đang giữ · Khách
 * còn nợ, cùng khoá `Finance.overview.tiles`.
 *
 * Hai thẻ có dấu "i" trên web (doanh thu/chi phí đã trừ cọc · dòng tiền ròng gồm cọc) — trên app
 * hai câu giải thích đó đứng ở chân thẻ, vì không có hover. Mọi thẻ chạm được mở đúng sổ phiếu đã
 * lọc như liên kết của web.
 */
export function FinanceOverviewCards({
  data,
  filters,
  revenueReceipts,
  costReceipts,
  loading,
  error,
}: {
  data: FinanceSummary | undefined;
  filters: FinancePeriodFilters;
  /** Số phiếu thu kinh doanh của kỳ (cộng từ bảng theo danh mục) — `undefined` khi chưa có. */
  revenueReceipts: number | undefined;
  costReceipts: number | undefined;
  loading: boolean;
  error: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.overview.tiles');
  const tCards = useTranslations('Finance.overview.cards');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  if (error && !data) return <Callout tone="warning">{tCards('error')}</Callout>;
  if (!data) return <SkeletonText lines={8} />;

  const period = { from: filters.from, to: filters.to, status: RECEIPT_STATUS.APPROVED };
  const openLedger = (extra: Parameters<typeof ROUTES.manage.receipts>[0]) => () =>
    navigateOnce(ROUTES.manage.receipts({ ...period, ...extra }));
  const receiptsHint = (count: number | undefined) =>
    count === undefined ? t('exDeposit') : t('receipts', { count });

  const cells: StatCell[] = [
    {
      key: 'revenue',
      icon: 'trending-up-outline',
      label: t('revenue'),
      value: fmt.money(data.revenue),
      tone: colors.success,
      surface: colors.successSurface,
      valueTone: colors.success,
      hint: receiptsHint(revenueReceipts),
      onPress: openLedger({ type: RECEIPT_TYPE.INCOME, sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS }),
    },
    {
      key: 'cost',
      icon: 'trending-down-outline',
      label: t('cost'),
      value: fmt.money(data.cost),
      tone: colors.danger,
      surface: colors.dangerSurface,
      valueTone: colors.danger,
      hint: receiptsHint(costReceipts),
      onPress: openLedger({ type: RECEIPT_TYPE.EXPENSE, sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS }),
    },
    {
      key: 'profit',
      icon: 'wallet-outline',
      label: t('profit'),
      value: fmt.money(data.profit),
      tone: colors.primaryActive,
      valueTone: isNegativeMoney(data.profit) ? colors.danger : colors.success,
      hint:
        data.profitMarginPercent == null
          ? t('marginUnknown')
          : t('margin', { value: data.profitMarginPercent }),
    },
    {
      key: 'netCash',
      icon: 'swap-vertical-outline',
      label: t('netCash'),
      value: fmt.money(data.balance),
      tone: colors.textMuted,
      ...(isNegativeMoney(data.balance) ? { valueTone: colors.danger } : {}),
      hint: t('cashFlow', { in: fmt.money(data.totalIncome), out: fmt.money(data.totalExpense) }),
      onPress: openLedger({}),
    },
    {
      key: 'depositHeld',
      icon: 'lock-closed-outline',
      label: t('depositHeld'),
      value: fmt.money(data.depositHeld),
      tone: colors.info,
      surface: colors.infoSurface,
      hint: t('bookingsNow', { count: data.depositHeldBookings }),
      onPress: () =>
        navigateOnce(
          ROUTES.manage.receipts({
            status: RECEIPT_STATUS.APPROVED,
            sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
          }),
        ),
    },
    {
      key: 'debt',
      icon: 'alert-circle-outline',
      label: t('debt'),
      value: fmt.money(data.totalDebt),
      tone: colors.warning,
      surface: colors.warningSurface,
      hint: t('bookings', { count: data.debtBookings }),
      ...(isZeroMoney(data.totalDebt) ? {} : { valueTone: colors.danger }),
      onPress: () => navigateOnce(ROUTES.manage.debts()),
    },
  ];

  return (
    <Card padded={false} accessibilityLabel={t('label')}>
      {/* Mờ đi khi đang tải, nhưng VIỀN thẻ giữ nguyên — mờ cả thẻ thì nhìn ra một thẻ hỏng. */}
      <YStack opacity={loading ? 0.6 : 1}>
        <StatGrid variant="list" cells={cells} />
        <StatCardFooter>
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('businessNote')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('cashNote')}
            </Text>
          </YStack>
        </StatCardFooter>
      </YStack>
    </Card>
  );
}
