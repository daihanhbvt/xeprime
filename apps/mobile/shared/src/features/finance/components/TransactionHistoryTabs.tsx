import { createContext, useContext } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { PLAN_FEATURE } from '@xeprime/types';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';

export const TRANSACTION_HISTORY_VIEW = { LEDGER: 'ledger', DEBTS: 'debts' } as const;
export type TransactionHistoryView =
  (typeof TRANSACTION_HISTORY_VIEW)[keyof typeof TRANSACTION_HISTORY_VIEW];

const VIEWS: readonly TransactionHistoryView[] = [
  TRANSACTION_HISTORY_VIEW.LEDGER,
  TRANSACTION_HISTORY_VIEW.DEBTS,
];

/**
 * Bộ chuyển tab của vỏ `TransactionHistoryScreen` — có thì đổi tab là đổi STATE (hai màn đã dựng
 * vẫn nằm trong cây, chỉ ẩn/hiện), không có thì lùi về thay route như cũ.
 */
export const TransactionHistoryViewContext = createContext<
  ((view: TransactionHistoryView) => void) | null
>(null);

/** Đổi sang tab kia — dùng chung cho dải tab và lối tắt (thẻ "Công nợ khách hàng" của sổ Thu-Chi). */
export function useSwitchTransactionHistoryView(): (view: TransactionHistoryView) => void {
  const switchView = useContext(TransactionHistoryViewContext);
  return (
    switchView ??
    ((view) =>
      router.replace(
        view === TRANSACTION_HISTORY_VIEW.DEBTS ? ROUTES.manage.debts() : ROUTES.manage.receipts(),
      ))
  );
}

/**
 * Hai tab của "Lịch sử giao dịch" — bản native của nút chuyển `Segmented` có khung viền ở
 * `/manage/receipts` (web, ledger 09 §3.11): "Giao dịch thu chi" và "Công nợ".
 *
 * Tab Công nợ mang cờ gói RIÊNG (`PLAN_FEATURE.DEBTS`): gói không có thì dải tab vắng hẳn, như web.
 */
export function TransactionHistoryTabs({
  value,
  debtCount,
}: {
  value: TransactionHistoryView;
  /** Số đơn còn nợ — viên đếm cạnh tab "Công nợ" (Figma `24512:125314`). Chưa tải ⇒ không có viên. */
  debtCount?: number | undefined;
}) {
  const t = useTranslations('Finance.history.views');
  const debts = useFeature(PLAN_FEATURE.DEBTS);
  const switchView = useSwitchTransactionHistoryView();

  if (!debts.isVisible) return null;

  return (
    <View style={styles.row} accessibilityLabel={t('label')}>
      <SegmentedTabs
        fit
        variant="neutral"
        items={VIEWS.map((view) => ({
          key: view,
          label: t(view),
          ...(view === TRANSACTION_HISTORY_VIEW.DEBTS && debtCount !== undefined
            ? { count: debtCount }
            : {}),
        }))}
        value={value}
        onChange={(view) => {
          if (view !== value) switchView(view);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
  },
});
