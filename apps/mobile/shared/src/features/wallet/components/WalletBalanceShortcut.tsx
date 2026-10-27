import { YStack } from 'tamagui';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { SettingRow } from '@/components/ui/SettingRow';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useAppFormat } from '@/i18n/use-app-format';
import { space } from '@/theme/tokens';
import { useWalletSummary } from '../hooks/use-wallet';
import { walletHrefFor, walletScopeFor } from '../wallet-scope';

/**
 * Lối tắt SỐ DƯ ở tab Tài khoản — bản native của `WalletBalancePill` bên web (góc đầu thẻ "Thông tin
 * tài khoản", design Account 22/10/2026).
 *
 * Trả lời đúng MỘT câu ("tôi còn bao nhiêu") và mở thẳng mục Quản lý thanh toán. Ba con số, sổ và
 * lệnh rút nằm ở màn đích — nhân bản chúng lên đây là mở đường cho hai chỗ hiện hai số dư khác nhau
 * cho cùng một người.
 *
 * Như web: đang tải, hỏng, hay tài khoản không có ví (nhân viên gian hàng) ⇒ không dựng gì. Một ô
 * "—" hay một dòng lỗi ở đây làm người dùng tin rằng tiền của mình có vấn đề, trong khi thứ hỏng
 * chỉ là một lối tắt; màn số dư vẫn vào được qua menu.
 */
export function WalletBalanceShortcut() {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();
  const scope = walletScopeFor(user);
  const summary = useWalletSummary(scope ?? WALLET_SCOPE.ACCOUNT, Boolean(user) && scope !== null);

  if (!user || !scope || !summary.data) return null;

  return (
    <Card padded={false}>
      <YStack px={space.md} py={space.xs}>
        <SettingRow
          icon="wallet-outline"
          label={t('pill.label')}
          description={fmt.money(summary.data.available)}
          href={walletHrefFor(scope)}
        />
      </YStack>
    </Card>
  );
}
