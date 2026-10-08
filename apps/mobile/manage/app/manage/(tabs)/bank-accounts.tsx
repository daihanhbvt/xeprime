import { BANK_ACCOUNT_SCOPE } from '@/api/bank-accounts/api';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { BankAccountListScreen } from '@/features/bank-accounts/BankAccountListScreen';

/**
 * Tài khoản nhận tiền của chủ xe tuyến HOA HỒNG — web `/bank-accounts` của site partner
 * (`<OwnerGate><BankAccountList scope="shop" /></OwnerGate>`). Gian hàng tuyến gói được
 * `ScopeGuard` đưa sang khu Gian hàng (`packageEquivalent`).
 */
export default function ManageBankAccountsRoute() {
  return (
    <OwnerGate header={<ManageHeader />}>
      <BankAccountListScreen scope={BANK_ACCOUNT_SCOPE.SHOP} shell="manage" />
    </OwnerGate>
  );
}
