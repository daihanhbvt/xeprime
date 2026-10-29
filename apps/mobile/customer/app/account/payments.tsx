import { RequireSession } from '@/features/auth/RequireSession';
import { AccountPaymentsHub } from '@/features/account-payments/AccountPaymentsHub';
import { ACCOUNT_PAYMENTS_TAB } from '@/features/account-payments/components/AccountPaymentsTabs';

/**
 * Lịch sử thanh toán của CHÍNH khách — không gác `OwnerGate`.
 *
 * Đây là tiền khách đã trả cho gian hàng, nên nó thuộc về mọi người thuê xe, không riêng chủ xe.
 */
export default function AccountPaymentsRoute() {
  return (
    <RequireSession>
      <AccountPaymentsHub initialTab={ACCOUNT_PAYMENTS_TAB.HISTORY} />
    </RequireSession>
  );
}
