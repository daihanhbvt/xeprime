import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BANK_ACCOUNT_SCOPE, type BankAccount, type BankAccountScope } from '@/api/bank-accounts/api';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { BankAccountFormSheet } from '@/features/bank-accounts/components/BankAccountFormSheet';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, space } from '@/theme/tokens';
import { useProvideRefundAccount } from '../hooks/use-trips';

/**
 * Khai tài khoản nhận tiền hoàn khoản giữ chỗ — ADR 0033.
 *
 * ## Scope đi theo CHỦ VÍ, không đóng đinh `account`
 *
 * ADR 0038 ràng buộc 6: sổ tài khoản ngân hàng đi theo chủ ví, qua cùng luật chọn tenant mà
 * `resolveRefundWalletOwner` dùng ở server. Một chủ xe có ví thuộc TENANT, nên hỏi scope
 * `account` ở đây sẽ hiện một danh sách RỖNG cho người đã khai tài khoản từ lâu — rồi họ khai
 * lại, và sổ vừa hợp nhất bị tách đôi đúng ở chỗ nó vừa được gộp.
 *
 * Đây là lý do scope suy từ `walletScopeFor`, cùng hàm mà màn ví và màn tài khoản nhận tiền dùng.
 */
export function RefundAccountSheet({
  tripId,
  amount,
  open,
  onClose,
}: {
  tripId: string;
  amount: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('BankAccounts.refund');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const { data: user } = useCurrentUser();
  const scope: BankAccountScope =
    walletScopeFor(user) === WALLET_SCOPE.SHOP
      ? BANK_ACCOUNT_SCOPE.SHOP
      : BANK_ACCOUNT_SCOPE.ACCOUNT;

  const { data: accounts, isPending } = useBankAccounts(scope, open);
  const provide = useProvideRefundAccount(tripId);

  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = accounts ?? [];
  // Mặc định là tài khoản MẶC ĐỊNH của họ — người dùng thường không có lựa chọn thứ hai để cân nhắc.
  const chosen = selected ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null;

  const submit = () => {
    if (!chosen) return;
    provide.mutate(
      { bankAccountId: chosen },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          onClose();
        },
        onError: (error: unknown) => toast.showError(errorMessage(error)),
      },
    );
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={t('title')}>
        <YStack gap={space.md}>
          <Callout tone="info">{t('intro', { amount: fmt.money(amount) })}</Callout>

          {isPending ? <MiniRowsSkeleton rows={2} /> : null}

          {!isPending && list.length > 0 ? (
            <MenuOptionList>
              {list.map((account) => (
                <MenuOption
                  key={account.id}
                  label={account.label || account.bankCode}
                  hint={`${account.bankCode} · ${account.accountNumberMasked}`}
                  meta={account.accountName}
                  selected={account.id === chosen}
                  onPress={() => setSelected(account.id)}
                />
              ))}
            </MenuOptionList>
          ) : null}

          {!isPending && list.length === 0 ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('pickSaved')}
            </Text>
          ) : null}

          <Button
            label={list.length > 0 ? t('useNew') : t('pickSaved')}
            variant="ghost"
            onPress={() => setFormOpen(true)}
          />

          <Button
            label={t('submit')}
            size="lg"
            disabled={!chosen}
            loading={provide.isPending}
            onPress={submit}
          />
        </YStack>
      </BottomSheet>

      {/* Khai xong thì chọn luôn tài khoản vừa thêm — không bắt người dùng tìm lại nó trong danh sách. */}
      <BankAccountFormSheet
        scope={scope}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(account: BankAccount) => setSelected(account.id)}
      />
    </>
  );
}
