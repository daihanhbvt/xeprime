import { useRouter } from 'expo-router';
import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Chip } from '@/components/ui/Chip';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';

export const ACCOUNT_PAYMENTS_TAB = {
  BALANCE: 'balance',
  HISTORY: 'history',
} as const;

export type AccountPaymentsTab = (typeof ACCOUNT_PAYMENTS_TAB)[keyof typeof ACCOUNT_PAYMENTS_TAB];

/**
 * Hai tab của mục "Quản lý thanh toán" — bản native của `AccountPaymentsHub` bên web (design
 * Account 22/10/2026): "Tài khoản thanh toán" (`/account/balance`) · "Lịch sử giao dịch"
 * (`/account/payments`).
 *
 * Mỗi tab là một MÀN có sẵn, như web để mỗi tab là một route. Đổi tab bằng `replace`, không `push`:
 * hai tab là hai mặt của CÙNG một mục, nên nút lui phải về menu tài khoản chứ không lật qua lại
 * giữa hai tab.
 */
export function AccountPaymentsTabs({ value }: { value: AccountPaymentsTab }) {
  const t = useTranslations('AccountPayments.hub');
  const router = useRouter();

  return (
    <XStack
      px={layout.screenX}
      pt={space.sm}
      gap={space.xs}
      ai="center"
      accessibilityRole="tablist"
      accessibilityLabel={t('tabsLabel')}
    >
      <Chip
        label={t('tabs.balance')}
        selected={value === ACCOUNT_PAYMENTS_TAB.BALANCE}
        size="sm"
        variant="segmented"
        grow
        onPress={() => {
          if (value !== ACCOUNT_PAYMENTS_TAB.BALANCE) router.replace(ROUTES.account.balance());
        }}
      />
      <Chip
        label={t('tabs.history')}
        selected={value === ACCOUNT_PAYMENTS_TAB.HISTORY}
        size="sm"
        variant="segmented"
        grow
        onPress={() => {
          if (value !== ACCOUNT_PAYMENTS_TAB.HISTORY) router.replace(ROUTES.account.payments());
        }}
      />
    </XStack>
  );
}
