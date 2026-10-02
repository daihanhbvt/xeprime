import { WALLET_SCOPE } from '@/api/wallet/api';
import { WalletScreen } from '@/features/wallet/WalletScreen';

/**
 * Ví điểm của GIAN HÀNG — khoản XePrime phải trả sau mỗi chuyến (ADR 0033 điều 2).
 *
 * KHÔNG gác bằng `PLAN_FEATURE`: đây là tiền của chính họ. Gói hết hạn vẫn phải xem và rút được —
 * ADR 0027 điều 3 nói hết hạn là `read_only` chứ không phải `hidden`, và tiền thì không thuộc về
 * gói. Quyền đọc/ghi vẫn do backend gác (`SELLER_PROFILE_VIEW` / `SELLER_PROFILE_MANAGE`).
 */
export default function ManageBalanceRoute() {
  return <WalletScreen scope={WALLET_SCOPE.SHOP} />;
}
