import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import { WALLET_STATUS, type MoneyString } from '@xeprime/types';

/**
 * Ví rút được chưa — cùng phép của web `WalletView` (`!isNegativeMoney(subtractMoney(available,
 * minWithdrawAmount))`). Tiền đi dạng CHUỖI qua helper domain, không `Number()` (ADR 0007): số dư
 * lớn hay số lẻ đồng thì phép so số thực mới là chỗ sai.
 *
 * Ngưỡng do SERVER đặt (`minWithdrawAmount`) — đổi chính sách là đổi một con số ở `fee_policies`.
 */
export function canWithdraw(
  summary: { status: string; available: MoneyString; minWithdrawAmount: MoneyString } | undefined,
): boolean {
  if (!summary || summary.status === WALLET_STATUS.FROZEN) return false;
  return !isNegativeMoney(subtractMoney(summary.available, summary.minWithdrawAmount));
}
