import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { AccountPaymentsHub } from '@/features/account-payments/AccountPaymentsHub';
import { ACCOUNT_PAYMENTS_TAB } from '@/features/account-payments/components/AccountPaymentsTabs';
import { BALANCE_PAYOUT_SECTION, BALANCE_SECTION_PARAM } from '@/navigation/routes-base';

/**
 * Tab "Tài khoản thanh toán" của mục Quản lý thanh toán — ví điểm của TÀI KHOẢN KHÁCH (tiền hoàn
 * của những chuyến họ đi thuê, ADR 0033 điều 5) + tài khoản nhận tiền.
 *
 * Từ ADR 0053 điều 8 tài khoản ở app này luôn là tài khoản khách, nên luôn là ví `user`: sổ của
 * gian hàng thuộc tài khoản ĐỐI TÁC và chỉ mở ở app XePrime Partner (web: `/account/balance` chỉ còn
 * `WalletView scope="account"`). `?section=payout` (alias `/account/bank-accounts`) cuộn tới khối
 * tài khoản nhận tiền.
 */
export default function AccountBalanceRoute() {
  const params = useLocalSearchParams<{ [BALANCE_SECTION_PARAM]?: string }>();
  return (
    <RequireSession>
      <AccountPaymentsHub
        initialTab={ACCOUNT_PAYMENTS_TAB.BALANCE}
        focusPayout={params[BALANCE_SECTION_PARAM] === BALANCE_PAYOUT_SECTION}
      />
    </RequireSession>
  );
}
