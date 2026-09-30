import { RequireSession } from '@/features/auth/RequireSession';
import { AccountPaymentsScreen } from '@/features/account-payments/AccountPaymentsScreen';

/**
 * Lịch sử thanh toán của CHÍNH khách — không gác `OwnerGate`.
 *
 * Đây là tiền khách đã trả cho gian hàng, nên nó thuộc về mọi người thuê xe, không riêng chủ xe.
 */
export default function AccountPaymentsRoute() {
  return (
    <RequireSession>
      <AccountPaymentsScreen />
    </RequireSession>
  );
}
