import { OWNER_STAGE } from '@xeprime/types';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { RequireSession } from '@/features/auth/RequireSession';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { WalletScreen } from '@/features/wallet/WalletScreen';

/**
 * "Tiền cho thuê xe" — sổ ví của GIAN HÀNG, nhìn từ khu khách.
 *
 * Cùng `WalletScreen` với `/manage/balance`, chỉ khác cái vỏ: chủ xe tuyến hoa hồng không vào khu
 * quản lý được (ADR 0038 điều 4), nên sổ tenant của họ cần một cửa trong khu khách.
 *
 * Scope đóng đinh `shop` chứ không suy từ `walletScopeFor`: đây là địa chỉ của MỘT sổ cụ thể, và
 * `OwnerGate` đã bảo đảm người vào được là chủ xe — tức người có ví thuộc tenant (ADR 0038 điều 2).
 */
export default function AccountEarningsRoute() {
  return (
    <RequireSession>
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        <WalletScreen scope={WALLET_SCOPE.SHOP} />
      </OwnerGate>
    </RequireSession>
  );
}
