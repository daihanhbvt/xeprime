import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
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
 * Chỉ là dải chuyển — nơi gọi quyết đổi gì. `AccountPaymentsHub` đổi THÂN màn tại chỗ (không mở
 * màn mới, người dùng chốt 29/10/2026).
 */
export function AccountPaymentsTabs({
  value,
  onChange,
}: {
  value: AccountPaymentsTab;
  onChange: (next: AccountPaymentsTab) => void;
}) {
  const t = useTranslations('AccountPayments.hub');

  return (
    <XStack
      px={layout.screenX}
      pt={space.sm}
      gap={space.xs}
      ai="center"
      accessibilityRole="tablist"
      accessibilityLabel={t('tabsLabel')}
    >
      {/* Khuôn dải tab chung (`SegmentedTabs`, người dùng chốt 28/10/2026). */}
      <SegmentedTabs
        items={[
          { key: ACCOUNT_PAYMENTS_TAB.BALANCE, label: t('tabs.balance') },
          { key: ACCOUNT_PAYMENTS_TAB.HISTORY, label: t('tabs.history') },
        ]}
        value={value}
        onChange={(next) => {
          if (next !== value) onChange(next as AccountPaymentsTab);
        }}
      />
    </XStack>
  );
}
