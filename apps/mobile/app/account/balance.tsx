import { RequireSession } from '@/features/auth/RequireSession';
import { WalletScreen } from '@/features/wallet/WalletScreen';

/**
 * Ví điểm CÁ NHÂN — sổ công nợ XePrime phải trả cho chính người đang đăng nhập (ADR 0033).
 *
 * KHÔNG bọc `OwnerGate`: khách thuê cũng có số dư (tiền hoàn cọc) và họ là phần đông người dùng.
 * Web để trang này ngoài cổng chủ xe vì đúng lý do đó.
 */
export default function AccountBalanceRoute() {
  return (
    <RequireSession>
      <WalletScreen />
    </RequireSession>
  );
}
