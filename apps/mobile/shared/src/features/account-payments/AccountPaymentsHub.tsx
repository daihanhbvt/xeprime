import { useRouter } from 'expo-router';
import { useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { WalletScreen } from '@/features/wallet/WalletScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { AccountPaymentsScreen } from './AccountPaymentsScreen';
import {
  ACCOUNT_PAYMENTS_TAB,
  AccountPaymentsTabs,
  type AccountPaymentsTab,
} from './components/AccountPaymentsTabs';

/**
 * Mục "Quản lý thanh toán" — MỘT màn, hai tab đổi THÂN tại chỗ (người dùng chốt 29/10/2026).
 *
 * Trước đây mỗi tab là một route và đổi tab là `replace` sang màn khác: header dựng lại, danh sách
 * tải lại, cảm giác như mở trang mới. Giờ header + dải tab đứng yên; tab đã mở một lần thì GIỮ
 * mount (ẩn bằng `display`) nên quay lại không tải lại và giữ vị trí cuộn. Hai route
 * `/account/balance` · `/account/payments` vẫn còn, chỉ chọn tab mở đầu.
 */
export function AccountPaymentsHub({
  initialTab,
  focusPayout = false,
}: {
  initialTab: AccountPaymentsTab;
  focusPayout?: boolean;
}) {
  const t = useTranslations('AccountPayments.hub');
  const router = useRouter();
  const [tab, setTab] = useState<AccountPaymentsTab>(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<AccountPaymentsTab>>(() => new Set([initialTab]));

  const select = (next: AccountPaymentsTab) => {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <AccountPaymentsTabs value={tab} onChange={select} />
      {visited.has(ACCOUNT_PAYMENTS_TAB.BALANCE) ? (
        <YStack f={1} display={tab === ACCOUNT_PAYMENTS_TAB.BALANCE ? 'flex' : 'none'}>
          <WalletScreen scope={WALLET_SCOPE.ACCOUNT} focusPayout={focusPayout} />
        </YStack>
      ) : null}
      {visited.has(ACCOUNT_PAYMENTS_TAB.HISTORY) ? (
        <YStack f={1} display={tab === ACCOUNT_PAYMENTS_TAB.HISTORY ? 'flex' : 'none'}>
          <AccountPaymentsScreen />
        </YStack>
      ) : null}
    </>
  );
}
