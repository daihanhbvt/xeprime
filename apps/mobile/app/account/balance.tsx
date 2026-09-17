import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { RequireSession } from '@/features/auth/RequireSession';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { WalletScreen } from '@/features/wallet/WalletScreen';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import { ROUTES } from '@/navigation/routes';

/**
 * Ví điểm CÁ NHÂN — và cửa chuyển hướng cho người đã là chủ xe.
 *
 * Ví của một chủ xe đã đổi chủ sang tenant từ lúc họ mở gian hàng (ADR 0038 điều 2), nên sổ của
 * họ nằm ở `/account/earnings`. Hỏi `/account/wallet` cho họ sẽ nhận về số 0 — ĐÚNG theo server,
 * và vì thế không có lỗi nào hiện ra: màn chỉ lặng lẽ nói "0 điểm" cho người đang có tiền.
 *
 * CHUYỂN HƯỚNG chứ không tự đổi scope tại chỗ: hai sổ là hai địa chỉ, nên một liên kết đã chia sẻ
 * hay một bookmark cũ phải dẫn tới đúng cái sổ nó nói tới. Cùng cách web giải.
 */
function AccountBalanceContent() {
  const router = useRouter();
  const user = useAuthenticatedUser();
  const isShopWallet = walletScopeFor(user) === WALLET_SCOPE.SHOP;

  useEffect(() => {
    if (isShopWallet) router.replace(ROUTES.account.earnings());
  }, [isShopWallet, router]);

  // Đang trên đường rời màn thì đừng vẽ một sổ rỗng ra trong một khung hình.
  if (isShopWallet) {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }

  return <WalletScreen scope={WALLET_SCOPE.ACCOUNT} />;
}

export default function AccountBalanceRoute() {
  return (
    <RequireSession>
      <AccountBalanceContent />
    </RequireSession>
  );
}
