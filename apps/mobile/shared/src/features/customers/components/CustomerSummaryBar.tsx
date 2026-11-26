import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { useCustomerSummary } from '../hooks/use-customers';

/** Chiều cao khung chờ — xấp xỉ thẻ thật (hàng ba chỉ số + dải nợ) để danh sách không nhảy khi dữ liệu về. */
const SKELETON_HEIGHT = 132;
const DISC_PAD = 8;
const ICON_SIZE = 20;
/** Figma: đệm thẻ, khe giữa hàng chỉ số và dải nợ, đệm ngang dải nợ đều là 12 (thang `space` không có 12). */
const PAD = 12;

/**
 * Dải chỉ số đầu sổ khách - Figma Partner-XePrime "Users List" `24486:59056` ("Vehicle Summary").
 *
 * Một thẻ trắng: hàng ba chỉ số (khách · lần thuê · tổng doanh thu), mỗi chỉ số là hình tròn nền
 * nhạt + con số đậm, nhãn xuống dưới; dưới cùng là dải nợ nền đỏ nhạt "tổng nợ · N khách còn nợ".
 * Dải nợ chỉ để xem (người dùng 25/11/2026), không bấm được.
 *
 * Cùng phép đếm với web (backend `groupBy`), nói về CẢ sổ chứ không phụ thuộc trang hay bộ lọc.
 * Hai ô tiền (doanh thu, nợ) **biến mất hoàn toàn** khi thiếu `finance.view`: "không được xem" và
 * "không có nợ" là hai chuyện khác nhau, và một số 0 giả sẽ được đọc như sự thật. Hỏng thì tự ẩn:
 * dải chỉ số là phụ trợ, không được chặn danh sách phía dưới.
 */
function CustomerSummaryBarImpl({
  enabled,
  canViewFinance,
}: {
  enabled: boolean;
  canViewFinance: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Customers.app.summary');
  const fmt = useAppFormat();
  const { data, isLoading, isError } = useCustomerSummary(enabled);

  if (!enabled || isError) return null;
  if (isLoading) return <Skeleton width="100%" height={SKELETON_HEIGHT} />;
  if (!data) return null;

  const showRevenue = canViewFinance && data.totalRevenue != null;
  const showDebt = canViewFinance && data.totalDebt != null;

  return (
    <Card padded={false}>
      <YStack p={PAD} gap={PAD}>
        <XStack>
          <StatCell
            icon="users-2"
            iconColor={colors.textMuted}
            disc={colors.surfaceMuted}
            value={fmt.count(data.activeCustomers)}
            label={t('customers')}
          />
          <StatCell
            icon="tick-circle"
            iconColor={colors.info}
            disc={colors.infoLow}
            value={fmt.count(data.totalRentals)}
            label={t('rentals')}
          />
          {showRevenue ? (
            <StatCell
              icon="wallet"
              iconColor={colors.success}
              disc={colors.successSurface}
              value={t('revenueCompact', { amount: fmt.moneyCompact(data.totalRevenue) })}
              label={t('revenue')}
            />
          ) : null}
        </XStack>

        {showDebt ? (
          <XStack
            ai="center"
            jc="space-between"
            gap={space.sm}
            px={PAD}
            py={space.sm}
            br={radius.control}
            bg={colors.dangerSurface}
          >
            <Text
              col={colors.danger}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
              flexShrink={1}
            >
              {fmt.money(data.totalDebt)}
            </Text>
            <Text
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              numberOfLines={1}
              flexShrink={0}
            >
              {t('debtCustomers', { count: data.debtCustomers ?? 0 })}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

/** Một chỉ số: hình tròn nền nhạt + con số 16 đậm, nhãn 12 thường ngay dưới. */
function StatCell({
  icon,
  iconColor,
  disc,
  value,
  label,
}: {
  icon: LineIconName;
  iconColor: string;
  disc: string;
  value: string;
  label: string;
}) {
  const colors = useColors();
  return (
    <YStack
      f={1}
      flexBasis={0}
      minWidth={0}
      gap={space.sm}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <XStack ai="center" gap={6}>
        <YStack p={DISC_PAD} br={radius.pill} bg={disc}>
          <LineIcon name={icon} size={ICON_SIZE} color={iconColor} />
        </YStack>
        <Text
          flexShrink={1}
          col={colors.text}
          fos={typeScale.title.fontSize}
          lh={typeScale.title.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {value}
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
        {label}
      </Text>
    </YStack>
  );
}

export const CustomerSummaryBar = memo(CustomerSummaryBarImpl);
