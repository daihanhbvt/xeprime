import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PLAN_FEATURE } from '@xeprime/types';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { DebtListScreen } from './DebtListScreen';
import { ReceiptListScreen } from './ReceiptListScreen';
import {
  TRANSACTION_HISTORY_VIEW,
  TransactionHistoryViewContext,
  type TransactionHistoryView,
} from './components/TransactionHistoryTabs';

/**
 * Vỏ "Lịch sử giao dịch" — hai tab Giao dịch thu chi · Công nợ trong MỘT cây, như web gộp hai tab
 * vào một route (`/manage/receipts?view=debts`).
 *
 * Trước đây mỗi tab là một route và đổi tab là `router.replace`: cả màn bị huỷ rồi dựng lại từ
 * đầu (màn trắng, mất bộ lọc, mất vị trí cuộn). Giờ đổi tab chỉ đổi state: tab đã mở GIỮ NGUYÊN
 * trong cây và chỉ ẩn (`display: none`), tab chưa mở thì dựng lần đầu khi chạm tới (lười).
 *
 * Chi nhánh là tham số của route (`useScreenBranchFilter`) nên hai tab tự dùng chung chi nhánh —
 * đúng như web sang Công nợ kèm chi nhánh đang lọc.
 */
export function TransactionHistoryScreen({ initialView }: { initialView: TransactionHistoryView }) {
  const params = useLocalSearchParams<{ view?: string }>();
  const debts = useFeature(PLAN_FEATURE.DEBTS);
  // Web `receipts/page.tsx`: `?view=debts` mở tab Công nợ.
  const requested =
    params.view === TRANSACTION_HISTORY_VIEW.DEBTS ? TRANSACTION_HISTORY_VIEW.DEBTS : initialView;
  const [view, setView] = useState<TransactionHistoryView>(requested);
  const [mounted, setMounted] = useState<ReadonlySet<TransactionHistoryView>>(
    () => new Set([requested]),
  );

  const switchView = useCallback((next: TransactionHistoryView) => {
    setMounted((current) => (current.has(next) ? current : new Set([...current, next])));
    setView(next);
  }, []);

  /* Gói không có tab Công nợ ⇒ chỉ còn sổ Thu-Chi (màn Công nợ tự chuyển hướng nếu bị mở thẳng). */
  const active =
    view === TRANSACTION_HISTORY_VIEW.DEBTS && !debts.isVisible
      ? TRANSACTION_HISTORY_VIEW.LEDGER
      : view;
  const showLedger = active === TRANSACTION_HISTORY_VIEW.LEDGER || mounted.has(TRANSACTION_HISTORY_VIEW.LEDGER);
  const showDebts = mounted.has(TRANSACTION_HISTORY_VIEW.DEBTS) && debts.isVisible;

  return (
    <TransactionHistoryViewContext.Provider value={switchView}>
      {showLedger ? (
        <View style={active === TRANSACTION_HISTORY_VIEW.LEDGER ? styles.pane : styles.hidden}>
          <ReceiptListScreen />
        </View>
      ) : null}
      {showDebts ? (
        <View style={active === TRANSACTION_HISTORY_VIEW.DEBTS ? styles.pane : styles.hidden}>
          <DebtListScreen />
        </View>
      ) : null}
    </TransactionHistoryViewContext.Provider>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  hidden: { display: 'none' },
});
