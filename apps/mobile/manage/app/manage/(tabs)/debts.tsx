import { TransactionHistoryScreen } from '@/features/finance/TransactionHistoryScreen';

/** Hai tab Thu-Chi · Công nợ chung một vỏ - đổi tab không dựng lại màn (xem `TransactionHistoryScreen`). */
export default function ManageDebtsRoute() {
  return <TransactionHistoryScreen initialView="debts" />;
}
