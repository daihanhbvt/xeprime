import { useTranslations } from 'use-intl';
import { Callout } from '@/components/ui/Callout';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { XStack } from 'tamagui';
import { SummaryTile } from './SummaryTile';
import type { DebtSummary } from '../api';

/** Figma "Summary Metrics": hai ô một hàng, cách 12. */
const GRID_GAP = 12;

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
  // Nhãn "Trong hạn" / "Chưa thu" của app theo Figma `24512:126967`; web giữ chữ của nó.
  const tApp = useTranslations('Finance.debts.partnerApp.tiles');
  const tSummary = useTranslations('Finance.receipts.summary');
  const fmt = useAppFormat();

  if (error && !data) return <Callout tone="warning">{tSummary('error')}</Callout>;
  if (!data) return <SkeletonText lines={4} />;

  const overdue = data.overdueCount > 0;

  /* Lưới 2×2 cùng ô với sổ Thu-Chi (Figma "Summary Metrics" của tab Công nợ). Đổi bộ lọc: giữ số cũ, mờ đi. */
  return (
    <XStack flexWrap="wrap" gap={GRID_GAP} opacity={loading ? 0.6 : 1} accessibilityLabel={t('label')}>
      <SummaryTile
        label={t('total')}
        value={fmt.money(data.totalAmount)}
        valueColor={colors.text}
        hint={t('totalHint', { orders: data.totalCount, customers: data.customerCount })}
      />
      <SummaryTile
        label={t('overdue')}
        value={fmt.money(data.overdueAmount)}
        valueColor={overdue ? colors.danger : colors.text}
        hint={t('overdueHint', { count: data.overdueCount })}
      />
      <SummaryTile
        label={tApp('within')}
        value={fmt.money(data.withinTermAmount)}
        valueColor={colors.text}
        hint={tApp('withinHint', { count: data.withinTermCount })}
      />
      <SummaryTile
        label={tApp('unpaid')}
        value={t('unpaidValue', { count: data.unpaidCount })}
        valueColor={colors.text}
        hint={tApp('unpaidHint', { count: data.unpaidCount })}
      />
    </XStack>
  );
}
