import { RequireSession } from '@/features/auth/RequireSession';
import { BankAccountListScreen } from '@/features/bank-accounts/BankAccountListScreen';

/**
 * Tài khoản NHẬN tiền của cá nhân — nơi XePrime chuyển tiền hoàn cọc và các khoản phải trả.
 *
 * Cũng không gác theo vai chủ xe: tiền hoàn cọc là của khách thuê. Tiền của GIAN HÀNG là một sổ
 * khác, ở khu quản lý — hai loại tiền, hai sổ, không trộn.
 */
export default function AccountBankAccountsRoute() {
  return (
    <RequireSession>
      <BankAccountListScreen />
    </RequireSession>
  );
}
