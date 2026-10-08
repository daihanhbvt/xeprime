import { BANK_ACCOUNT_SCOPE } from '@/api/bank-accounts/api';
import { RequireSession } from '@/features/auth/RequireSession';
import { BankAccountListScreen } from '@/features/bank-accounts/BankAccountListScreen';

/**
 * Tài khoản NHẬN tiền hoàn của khách. Tài khoản ở app này luôn là tài khoản khách (ADR 0053), nên
 * sổ luôn là sổ `account` — sổ nhận tiền của gian hàng nằm ở app XePrime Partner.
 */
export default function AccountBankAccountsRoute() {
  return (
    <RequireSession>
      <BankAccountListScreen scope={BANK_ACCOUNT_SCOPE.ACCOUNT} />
    </RequireSession>
  );
}
