import { Redirect } from 'expo-router';
import { ROUTES } from '@/navigation/routes';

/**
 * ALIAS cũ của "Tài khoản nhận tiền" — từ design Account (22/10/2026) nó là khối của tab "Tài khoản
 * thanh toán" trong mục Quản lý thanh toán, ngay dưới nút Rút (web `/account/bank-accounts` →
 * `accountBalancePayoutPath()`). Giữ route để deep link cũ không gãy.
 */
export default function AccountBankAccountsRoute() {
  return <Redirect href={ROUTES.account.balancePayout()} />;
}
