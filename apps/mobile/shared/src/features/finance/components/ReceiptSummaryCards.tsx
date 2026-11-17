import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { DebtSummary, ReceiptSummary } from '../api';

/**
 * Bốn thẻ đầu tab "Giao dịch thu chi" — bản native của web `ReceiptSummaryCards` (design
 * Partner-XePrime `23813:58308`, ledger 09 §3.11 #2): Tổng thu · Tổng chi · Cân đối · Công nợ
 * khách hàng.
 *
 * Ba thẻ đầu cộng ĐÚNG danh sách đang xem (backend dùng chung `whereOf`): một ô "Tổng thu" không
 * khớp danh sách ngay dưới nó là cách nhanh nhất khiến người dùng thôi tin cả hai con số. Chỉ phiếu
 * ĐÃ DUYỆT được cộng — câu giải thích (ⓘ của web) đứng ngay dưới thẻ.
 *
 * Thẻ Công nợ thay ô "Số phiếu đã duyệt" cũ (chốt 04/11/2026): số phiếu đã có ở tổng dòng của danh
 * sách, còn khoản khách đang nợ là câu người giữ sổ hỏi ngay sau "tháng này thu bao nhiêu". Chạm
 * vào nó là sang tab Công nợ.
 *
 * Cùng khuôn danh sách thẻ số (`StatGrid` list) với Tổng quan doanh thu và Công nợ — một app, một
 * cách đọc thẻ tiền.
 */
export function ReceiptSummaryCards({
  data,
  loading,
  error,
  filtered,
  debt,
}: {
  data: ReceiptSummary | undefined;
  loading: boolean;
  error: boolean;
  /** Có bộ lọc nào đang bật không — đổi câu giải thích, không đổi con số. */
  filtered: boolean;
  /**
   * Công nợ khách hàng TẠI LÚC NÀY. `null` = người xem không vào được Công nợ (gói không có) —
   * thẻ vắng hẳn thay vì hiện một số 0 giả.
   */
  debt: { data: DebtSummary | undefined; loading: boolean; onPress: () => void } | null;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.receipts.tiles');
  const tSummary = useTranslations('Finance.receipts.summary');
  const fmt = useAppFormat();

  if (error && !data) return <Callout tone="warning">{tSummary('error')}</Callout>;
  if (!data) return <SkeletonText lines={4} />;

  const balanceNegative = isNegativeMoney(data.balance);
  const owing = debt?.data !== undefined && debt.data.totalCount > 0;

  const cells: StatCell[] = [
    {
      key: 'income',
      icon: 'arrow-down-circle-outline',
      label: t('income'),
      value: fmt.money(data.totalIncome),
      tone: colors.success,
      surface: colors.successSurface,
      hint: t('incomeHint', {
        cash: fmt.money(data.incomeCash),
        transfer: fmt.money(data.incomeTransfer),
      }),
    },
    {
      key: 'expense',
      icon: 'arrow-up-circle-outline',
      label: t('expense'),
      value: fmt.money(data.totalExpense),
      tone: colors.danger,
      surface: colors.dangerSurface,
      valueTone: colors.danger,
    },
    {
      key: 'balance',
      icon: 'swap-vertical-outline',
      label: t('balance'),
      value: fmt.money(data.balance),
      tone: balanceNegative ? colors.danger : colors.success,
      valueTone: balanceNegative ? colors.danger : colors.success,
      hint: t('balanceHint'),
    },
    ...(debt
      ? [
          {
            key: 'debt',
            icon: 'people-outline',
            label: t('debt'),
            value: debt.data ? fmt.money(debt.data.totalAmount) : '-',
            tone: owing ? colors.danger : colors.textMuted,
            ...(owing ? { surface: colors.dangerSurface, valueTone: colors.danger } : {}),
            hint: debt.data
              ? [t('debtHint', { count: debt.data.totalCount }), t('debtInfo')]
              : t('debtInfo'),
            onPress: debt.onPress,
          } satisfies StatCell,
        ]
      : []),
  ];

  /* Đổi bộ lọc: GIỮ số cũ và mờ đi, thay vì nháy về skeleton rồi nhảy lại một con số khác. */
  return (
    <YStack gap={space.xs}>
      <Card padded={false} accessibilityLabel={t('label')}>
        <YStack opacity={loading || (debt?.loading ?? false) ? 0.6 : 1}>
          <StatGrid variant="list" cells={cells} />
        </YStack>
      </Card>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {filtered ? t('infoFiltered') : t('infoWhole')}
      </Text>
    </YStack>
  );
}
