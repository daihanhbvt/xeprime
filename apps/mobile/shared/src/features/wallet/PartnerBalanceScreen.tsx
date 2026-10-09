import { WALLET_SCOPE } from '@/api/wallet/api';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { useTranslations } from 'use-intl';
import { walletScopeFor } from './wallet-scope';
import { WalletScreen } from './WalletScreen';

/**
 * Trang "Số dư" của app Partner — bản native của web `PartnerBalanceView` (PR #159).
 *
 * Chỉ CHỦ gian hàng có ví và tài khoản nhận tiền (`@ShopOwnerOnly`, ADR 0038 điều 3 · ADR 0053
 * điều 8). Thành viên mở trang này (menu cũ, thông báo, deep link) thấy câu "chỉ chủ sở hữu" thay
 * vì một màn lỗi 403 hay một ví rỗng giả. Quyết định qua `walletScopeFor` — MỘT chỗ cho cả app.
 */
export function PartnerBalanceScreen({ focusPayout = false }: { focusPayout?: boolean }) {
  const t = useTranslations('Wallet.ownerOnly');
  const me = useCurrentUser();

  if (me.isPending) {
    return (
      <>
        <ManageHeader />
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (me.isError) {
    return (
      <>
        <ManageHeader />
        <Screen scroll={false}>
          <ScreenError error={me.error} onRetry={() => void me.refetch()} />
        </Screen>
      </>
    );
  }

  if (walletScopeFor(me.data) !== WALLET_SCOPE.SHOP) {
    return (
      <>
        <ManageHeader />
        <Screen scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('title')}
            description={t('description')}
          />
        </Screen>
      </>
    );
  }

  return <WalletScreen scope={WALLET_SCOPE.SHOP} focusPayout={focusPayout} />;
}
