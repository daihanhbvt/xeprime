import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useTranslations } from 'use-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { dayjs, isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
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
  loading,
  error,
}: {
  data: FinanceSummary | undefined;
  filters: FinancePeriodFilters;
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
    Bố cục Figma "Tổng quan doanh thu" (`24228:98928`): thẻ Lợi nhuận (số lớn + biên + hai ô Doanh
    thu/Chi phí) · thẻ Dòng tiền ba cột · hai ô Cọc đang giữ / Khách còn nợ có mũi tên. Hai câu chú
    thích cũ dưới hai thẻ đã bỏ theo Figma (người dùng chốt 25/11/2026). Số liệu, điều hướng và
    quyền GIỮ NGUYÊN - chỉ đổi cách trình bày.
  */
  const month = fullMonthOf(filters.from, filters.to);
  return (
    <YStack gap={space.md} opacity={loading ? 0.6 : 1} accessibilityLabel={t('label')}>
      <Card lift="flat">
        <YStack gap={GAP_BLOCK}>
          <YStack gap={GAP_TIGHT}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text
                f={1}
                minWidth={0}
                col={colors.placeholder}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {month === null ? t('profit') : t('profitMonth', { month })}
              </Text>
              <Text
                col={profitNegative ? colors.danger : colors.success}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {marginLabel}
              </Text>
            </XStack>
            <Text
              col={profitNegative ? colors.danger : colors.text}
              fos={typeScale.display.fontSize}
              lh={typeScale.display.lineHeight}
              fow={fontWeight.bold}
              numberOfLines={1}
            >
              {fmt.money(data.profit)}
            </Text>
          </YStack>
          <XStack gap={space.sm}>
            <MiniTile
              label={t('revenue')}
              value={fmt.money(data.revenue)}
              bg={colors.warningWash}
              onPress={openLedger({
                type: RECEIPT_TYPE.INCOME,
                sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
              })}
            />
            <MiniTile
              label={t('cost')}
              value={fmt.money(data.cost)}
              bg={colors.background}
              onPress={openLedger({
                type: RECEIPT_TYPE.EXPENSE,
                sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
              })}
            />
          </XStack>
        </YStack>
      </Card>

      <Card lift="flat" onPress={openLedger({})} accessibilityLabel={t('cashTitle')}>
        <YStack gap={GAP_BLOCK}>
          <SectionHeader>{t('cashTitle')}</SectionHeader>
          <XStack>
            <CashCol
              arrow
              label={t('cashIn')}
              value={fmt.money(data.totalIncome)}
              valueTone={colors.success}
            />
            <CashCol
              arrow
              label={t('cashOut')}
              value={fmt.money(data.totalExpense)}
              valueTone={colors.danger}
            />
            <CashCol
              label={t('netCashShort')}
              value={signedMoney(fmt.money(data.balance), data.balance)}
              valueTone={isNegativeMoney(data.balance) ? colors.danger : colors.text}
            />
          </XStack>
        </YStack>
      </Card>

      <XStack gap={space.md}>
        <NavTile
          label={t('depositHeld')}
          value={fmt.money(data.depositHeld)}
          hint={t('bookingsNow', { count: data.depositHeldBookings })}
          onPress={openDeposits}
        />
        <NavTile
          label={t('debt')}
          value={fmt.money(data.totalDebt)}
          hint={t('bookings', { count: data.debtBookings })}
          onPress={() => navigateOnce(ROUTES.manage.debts())}
        />
      </XStack>
    </YStack>
  );
}

/** Figma: khoảng giữa các khối trong thẻ 12, giữa nhãn và số 4. */
const GAP_BLOCK = 12;
const GAP_TIGHT = 4;
/** Ô Doanh thu/Chi phí: đệm 8/6, bo 12. */
const TILE_PAD_X = 8;
const TILE_PAD_Y = 6;

/**
 * Số tháng khi kỳ đang xem đúng trọn MỘT tháng lịch ("Lợi nhuận tháng 11" của Figma); kỳ khác
 * (tuần, quý, khoảng tự chọn) thì `null` và nhãn chỉ còn "Lợi nhuận".
 */
function fullMonthOf(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) return null;
  const start = dayjs(from);
  const end = dayjs(to);
  if (!start.isSame(start.startOf('month'), 'day')) return null;
  if (!end.isSame(start.endOf('month'), 'day')) return null;
  return start.month() + 1;
}

/** "+23.800.000 đ" như Figma: dòng ròng dương mang dấu cộng; âm đã có dấu trừ từ bộ định dạng. */
function signedMoney(formatted: string, raw: string): string {
  return isNegativeMoney(raw) || isZeroMoney(raw) ? formatted : `+${formatted}`;
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
      <YStack br={radius.control} bg={bg} px={TILE_PAD_X} py={TILE_PAD_Y} gap={GAP_TIGHT}>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {label}
        </Text>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {value}
        </Text>
      </YStack>
    </Pressable>
  );
}

/** Một cột của thẻ Dòng tiền (Tiền vào · Tiền ra · Ròng trong kỳ) - Figma: mũi tên "Down 3" 16 cùng màu số. */
function CashCol({
  arrow = false,
  label,
  value,
  valueTone,
}: {
  arrow?: boolean;
  label: string;
  value: string;
  valueTone: string;
}) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth={0} gap={GAP_TIGHT}>
      <XStack ai="center" gap={GAP_TIGHT}>
        {arrow ? <LineIcon name="arrow-down-3" color={valueTone} size={16} /> : null}
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
          {label}
        </Text>
      </XStack>
      <Text
        col={valueTone}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.semibold}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </YStack>
  );
}

/** Ô điều hướng có mũi tên (Cọc đang giữ / Khách còn nợ) - Figma `24228:98964`. */
function NavTile({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth={0}>
      <Card lift="flat" onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <YStack f={1} minWidth={0} gap={2}>
            <Text
              col={colors.textMuted}
              fos={typeScale.caption.fontSize}
              lh={typeScale.caption.lineHeight}
              fow={fontWeight.medium}
              textTransform="uppercase"
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {value}
            </Text>
            <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
              {hint}
            </Text>
          </YStack>
          <LineIcon name="arrow-right" color={colors.infoStrong} size={20} />
        </XStack>
      </Card>
    </YStack>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
