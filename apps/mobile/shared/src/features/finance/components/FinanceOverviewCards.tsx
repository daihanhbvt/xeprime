import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { Ionicons } from '@/components/icons/Ionicons';
import { useTranslations } from 'use-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
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

  const profitNegative = isNegativeMoney(data.profit);
  const marginLabel =
    data.profitMarginPercent == null ? t('marginUnknown') : t('margin', { value: data.profitMarginPercent });
  const openDeposits = () =>
    navigateOnce(
      ROUTES.manage.receipts({
        status: RECEIPT_STATUS.APPROVED,
        sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
      }),
    );

  /*
    Bố cục Figma "Tổng quan doanh thu" (`24228:98928`, 17/11/2026): thẻ Lợi nhuận (số lớn + biên +
    hai ô Doanh thu/Chi phí) · thẻ Dòng tiền ba cột · hai ô Cọc đang giữ / Khách còn nợ có mũi tên.
    Số liệu, điều hướng và quyền GIỮ NGUYÊN - chỉ đổi cách trình bày.
  */
  return (
    <YStack gap={space.md} opacity={loading ? 0.6 : 1} accessibilityLabel={t('label')}>
      <Card>
        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('profit')}
            </Text>
            <Text
              col={profitNegative ? colors.danger : colors.success}
              fos={fontSize.label}
              fow={fontWeight.medium}
            >
              {marginLabel}
            </Text>
          </XStack>
          <Text
            col={profitNegative ? colors.danger : colors.text}
            fos={fontSize.h3}
            fow={fontWeight.bold}
            numberOfLines={1}
          >
            {fmt.money(data.profit)}
          </Text>
          <XStack gap={space.sm}>
            <MiniTile
              label={t('revenue')}
              value={fmt.money(data.revenue)}
              bg={colors.primaryLight}
              onPress={openLedger({
                type: RECEIPT_TYPE.INCOME,
                sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
              })}
            />
            <MiniTile
              label={t('cost')}
              value={fmt.money(data.cost)}
              bg={colors.surfaceMuted}
              onPress={openLedger({
                type: RECEIPT_TYPE.EXPENSE,
                sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
              })}
            />
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('businessNote')}
          </Text>
        </YStack>
      </Card>

      <Card onPress={openLedger({})} accessibilityLabel={t('cashTitle')}>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
            {t('cashTitle')}
          </Text>
          <XStack gap={space.sm}>
            <CashCol
              icon="arrow-down"
              tone={colors.success}
              label={t('cashIn')}
              value={fmt.money(data.totalIncome)}
              valueTone={colors.success}
            />
            <CashCol
              icon="arrow-up"
              tone={colors.danger}
              label={t('cashOut')}
              value={fmt.money(data.totalExpense)}
              valueTone={colors.danger}
            />
            <CashCol
              label={t('netCash')}
              value={fmt.money(data.balance)}
              valueTone={isNegativeMoney(data.balance) ? colors.danger : colors.text}
            />
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('cashNote')}
          </Text>
        </YStack>
      </Card>

      <XStack gap={space.sm}>
        <NavTile
          label={t('depositHeld')}
          value={fmt.money(data.depositHeld)}
          hint={t('bookingsNow', { count: data.depositHeldBookings })}
          onPress={openDeposits}
        />
        <NavTile
          label={t('debt')}
          value={fmt.money(data.totalDebt)}
          valueTone={isZeroMoney(data.totalDebt) ? colors.text : colors.danger}
          hint={t('bookings', { count: data.debtBookings })}
          onPress={() => navigateOnce(ROUTES.manage.debts())}
        />
      </XStack>
    </YStack>
  );
}

/** Ô nhỏ trong thẻ Lợi nhuận (Doanh thu / Chi phí) - chạm mở sổ thu chi đã lọc. */
function MiniTile({
  label,
  value,
  bg,
  onPress,
}: {
  label: string;
  value: string;
  bg: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={styles.flex}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <YStack br={radius.md} bg={bg} p={space.sm} gap={2}>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {label}
        </Text>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.bold}
          numberOfLines={1}
        >
          {value}
        </Text>
      </YStack>
    </Pressable>
  );
}

/** Một cột của thẻ Dòng tiền (Tiền vào · Tiền ra · Ròng trong kỳ). */
function CashCol({
  icon,
  tone,
  label,
  value,
  valueTone,
}: {
  icon?: 'arrow-down' | 'arrow-up';
  tone?: string;
  label: string;
  value: string;
  valueTone: string;
}) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth={0} gap={2}>
      <XStack ai="center" gap={space.xs}>
        {icon && tone ? <Ionicons name={icon} size={iconSize.xs} color={tone} /> : null}
        <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
          {label}
        </Text>
      </XStack>
      <Text
        col={valueTone}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.bold}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </YStack>
  );
}

/** Ô điều hướng có mũi tên (Cọc đang giữ / Khách còn nợ). */
function NavTile({
  label,
  value,
  hint,
  valueTone,
  onPress,
}: {
  label: string;
  value: string;
  hint: string;
  valueTone?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={styles.flex}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Card>
        <YStack gap={2}>
          <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium} textTransform="uppercase" numberOfLines={1}>
            {label}
          </Text>
          <XStack ai="center" jc="space-between" gap={space.xs}>
            <Text
              f={1}
              minWidth={0}
              col={valueTone ?? colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.bold}
              numberOfLines={1}
            >
              {value}
            </Text>
            <Ionicons name="arrow-forward" size={iconSize.sm} color={colors.info} />
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {hint}
          </Text>
        </YStack>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
