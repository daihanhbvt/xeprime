import { useTranslations } from 'use-intl';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { YStack } from 'tamagui';
import type { DebtSummary } from '../api';

/**
 * Dải thẻ của màn Công nợ — bản native của `DebtSummaryCards` (web, PR #276).
 *
 * Số đọc từ `GET /debts/summary`: cùng phạm vi tìm kiếm · chi nhánh · trạng thái với danh sách
 * nhưng KHÔNG theo nhóm hạn đang mở — thẻ "Nợ quá hạn" vẫn nói đúng số của nó khi người dùng đang
 * đứng ở chip "Chưa thu".
 */
export function DebtSummaryCards({
  data,
  loading,
  error,
}: {
  data: DebtSummary | undefined;
  loading: boolean;
  error: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.tiles');
  const tSummary = useTranslations('Finance.receipts.summary');
  const fmt = useAppFormat();

  if (error && !data) return <Callout tone="warning">{tSummary('error')}</Callout>;
  if (!data) return <SkeletonText lines={4} />;

  const overdue = data.overdueCount > 0;
  const cells: StatCell[] = [
    {
      key: 'total',
      icon: 'wallet-outline',
      label: t('total'),
      value: fmt.money(data.totalAmount),
      tone: colors.primaryActive,
      hint: t('totalHint', { orders: data.totalCount, customers: data.customerCount }),
    },
    {
      key: 'overdue',
      icon: 'alert-circle-outline',
      label: t('overdue'),
      value: fmt.money(data.overdueAmount),
      tone: overdue ? colors.danger : colors.textMuted,
      ...(overdue ? { surface: colors.dangerSurface, valueTone: colors.danger } : {}),
      hint: t('overdueHint', { count: data.overdueCount }),
    },
    {
      key: 'within',
      icon: 'time-outline',
      label: t('within'),
      value: fmt.money(data.withinTermAmount),
      tone: colors.info,
      hint: t('withinHint', { count: data.withinTermCount }),
    },
    {
      key: 'unpaid',
      icon: 'hourglass-outline',
      label: t('unpaid'),
      value: t('unpaidValue', { count: data.unpaidCount }),
      tone: colors.warning,
      hint: t('unpaidHint', { count: data.unpaidCount }),
    },
  ];

  /* Đổi bộ lọc: GIỮ số cũ và mờ đi, không nháy về skeleton. */
  return (
    <Card padded={false} accessibilityLabel={t('label')}>
      <YStack opacity={loading ? 0.6 : 1}>
        <StatGrid variant="list" cells={cells} />
      </YStack>
    </Card>
  );
}
