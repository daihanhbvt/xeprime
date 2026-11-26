import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { SummaryTile } from './SummaryTile';
import type { DebtSummary, ReceiptSummary } from '../api';

/**
 * Bốn thẻ đầu tab "Giao dịch thu chi" (Figma Partner-XePrime "Summary Metrics" `24512:125809`):
 * lưới 2×2 Tổng thu · Cân đối / Tổng chi · Công nợ khách hàng — mỗi ô một thẻ trắng riêng.
 *
 * Ba thẻ đầu cộng ĐÚNG danh sách đang xem (backend dùng chung `whereOf`), chỉ phiếu ĐÃ DUYỆT. Câu
 * giải thích nằm sau ⓘ cạnh nhãn Tổng thu (chốt 26/11/2026 - Figma không vẽ dòng ghi chú). Dòng
 * phụ Tổng thu rút gọn tiền như thẻ thống kê của hồ sơ khách (`fmt.moneyCompact`).
 *
 * Thẻ Công nợ là số TẠI LÚC NÀY, không theo kỳ đang lọc; chạm vào là sang tab Công nợ.
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

  /* Đổi bộ lọc: GIỮ số cũ và mờ đi, thay vì nháy về skeleton rồi nhảy lại một con số khác. */
  return (
    <XStack
      flexWrap="wrap"
      gap={space.md}
      opacity={loading || (debt?.loading ?? false) ? 0.6 : 1}
      accessibilityLabel={t('label')}
    >
      <SummaryTile
        label={t('income')}
        info={{ label: t('infoLabel'), content: filtered ? t('infoFiltered') : t('infoWhole') }}
        value={fmt.money(data.totalIncome)}
        valueColor={colors.text}
        hint={t('incomeHintCompact', {
          cash: fmt.moneyCompact(data.incomeCash),
          transfer: fmt.moneyCompact(data.incomeTransfer),
        })}
      />
      <SummaryTile
        label={t('balance')}
        value={fmt.money(data.balance)}
        valueColor={balanceNegative ? colors.danger : colors.success}
        hint={t('balanceHint')}
      />
      <SummaryTile label={t('expense')} value={fmt.money(data.totalExpense)} valueColor={colors.danger} />
      {debt ? (
        <SummaryTile
          label={t('debt')}
          info={{ label: t('debtInfoLabel'), content: t('debtInfo') }}
          value={debt.data ? fmt.money(debt.data.totalAmount) : '-'}
          valueColor={owing ? colors.danger : colors.text}
          {...(debt.data ? { hint: t('debtHint', { count: debt.data.totalCount }) } : {})}
          onPress={debt.onPress}
        />
      ) : null}
    </XStack>
  );
}
