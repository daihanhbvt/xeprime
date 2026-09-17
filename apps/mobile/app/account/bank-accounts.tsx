import { BANK_ACCOUNT_SCOPE } from '@/api/bank-accounts/api';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { RequireSession } from '@/features/auth/RequireSession';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { BankAccountListScreen } from '@/features/bank-accounts/BankAccountListScreen';
import { walletScopeFor } from '@/features/wallet/wallet-scope';

/**
 * Tài khoản NHẬN tiền — nơi XePrime chuyển tiền hoàn cọc và các khoản phải trả.
 *
 * Sổ tài khoản ngân hàng đi theo CHỦ VÍ, không theo bề mặt đang mở (ADR 0038 ràng buộc 6): đóng
 * đinh `account` ở đây sẽ tách đôi đúng cái sổ mà đợt hợp nhất vừa gộp lại — người dùng khai số
 * tài khoản ở một sổ rồi mở luồng rút tiền ra thấy danh sách rỗng ở sổ kia.
 */
function AccountBankAccountsContent() {
  const user = useAuthenticatedUser();
  const scope =
    walletScopeFor(user) === WALLET_SCOPE.SHOP
      ? BANK_ACCOUNT_SCOPE.SHOP
      : BANK_ACCOUNT_SCOPE.ACCOUNT;
  return <BankAccountListScreen scope={scope} />;
}

export default function AccountBankAccountsRoute() {
  return (
    <RequireSession>
      <AccountBankAccountsContent />
    </RequireSession>
  );
}
