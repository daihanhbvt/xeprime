import { WALLET_SCOPE } from '@/api/wallet/api';
import { RequireSession } from '@/features/auth/RequireSession';
import { WalletScreen } from '@/features/wallet/WalletScreen';

/**
 * Ví điểm của TÀI KHOẢN KHÁCH — tiền hoàn của những chuyến họ đi thuê (ADR 0033 điều 5).
 *
 * Từ ADR 0053 điều 8 tài khoản ở app này luôn là tài khoản khách, nên luôn là ví `user`: sổ của
 * gian hàng thuộc tài khoản ĐỐI TÁC và chỉ mở ở app XePrime Partner (web: `/account/balance` chỉ còn
 * `WalletView scope="account"`).
 */
export default function AccountBalanceRoute() {
  return (
    <RequireSession>
      <WalletScreen scope={WALLET_SCOPE.ACCOUNT} />
    </RequireSession>
  );
}
