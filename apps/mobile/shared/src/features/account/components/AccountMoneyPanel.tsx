import { useTranslations } from 'use-intl';
import { YStack } from 'tamagui';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { WalletSummaryCard } from '@/features/wallet/components/WalletSummaryCard';
import { walletHrefFor, walletScopeFor } from '@/features/wallet/wallet-scope';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { space } from '@/theme/tokens';
import { BANK_ACCOUNT_SCOPE, type BankAccountScope } from '@/api/bank-accounts/api';
import { WALLET_SCOPE } from '@/api/wallet/api';

/**
 * TIỀN trong hồ sơ "Tài khoản của tôi" — bản native của `AccountMoneyPanel`.
 *
 * ## Vì sao tiền về đây
 *
 * Trước ADR 0038 điều 9, một chủ xe tuyến hoa hồng mở menu và gặp BA màn tiền đứng cạnh nhau —
 * "Tiền cho thuê xe", "Lịch sử thanh toán", "Tài khoản nhận tiền". Không mục nào tự nói mình chứa
 * gì, và người đi tìm tiền của mình phải mở lần lượt để đoán. Nay ba cửa đó rời menu và gom vào
 * MỘT chỗ: chính khối này.
 *
 * Hệ quả trên app, và đây là lý do khối này bắt buộc phải có: `OWNER_NAV` KHÔNG còn mục ví lẫn
 * mục tài khoản ngân hàng, nên thiếu nó thì một chủ xe không có đường nào đọc số dư hay khai tài
 * khoản nhận tiền — tiền của họ biến mất khỏi giao diện.
 *
 * ## Ba con số, không phải một
 *
 * `WalletSummaryCard` tách khả dụng · đang chuyển · tổng nghĩa vụ (ADR 0033 điều 6). Gộp lại
 * thành một con số sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế, hoặc tưởng tiền đã
 * biến mất trong lúc chờ chuyển. Sổ giao dịch và các lệnh rút nằm sau một cú chạm — chúng là thứ
 * người ta mở khi đã có câu trả lời đầu tiên và muốn tra soát.
 *
 * ## Một ví, và `walletScopeFor` là nơi duy nhất quyết định nó thuộc về ai
 *
 * Chủ xe: ví thuộc TENANT — nhận cả tiền hoàn khi chính họ đi thuê lẫn khoản được nhận khi cho
 * thuê, và giữ nguyên khi nâng lên gói (ADR 0038 điều 2). Khách thuê thuần: ví thuộc `user`. Sổ
 * tài khoản ngân hàng đi theo ĐÚNG chủ ví đó, nếu không thì lệnh chuyển có một đích mà sổ không
 * thấy.
 */
export function AccountMoneyPanel() {
  const t = useTranslations('BankAccounts');
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();

  /*
   * Chưa biết mình là ai thì chưa chọn sổ: đoán sai scope nghĩa là hiện "0 đ" cho người đang có
   * tiền, và đó là câu trả lời tệ nhất cho câu hỏi họ đang hỏi.
   */
  if (!user) return null;

  const scope = walletScopeFor(user);
  const accountScope: BankAccountScope =
    scope === WALLET_SCOPE.SHOP ? BANK_ACCOUNT_SCOPE.SHOP : BANK_ACCOUNT_SCOPE.ACCOUNT;

  return (
    <YStack gap={space.lg}>
      <WalletSummaryCard scope={scope} onOpenLedger={() => navigateOnce(walletHrefFor(user))} />
      <BankAccountList scope={accountScope} title={t('title')} />
    </YStack>
  );
}
