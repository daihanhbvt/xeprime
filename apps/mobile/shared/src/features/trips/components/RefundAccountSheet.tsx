import { useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BANK_ACCOUNT_SCOPE, type BankAccountScope } from '@/api/bank-accounts/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { BankAccountCard } from '@/features/bank-accounts/components/BankAccountCard';
import { BankAccountFormSheet } from '@/features/bank-accounts/components/BankAccountFormSheet';
import { currentBankAccount } from '@/features/bank-accounts/current-account';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { useProvideRefundAccount } from '../hooks/use-trips';

/**
 * Khai tài khoản nhận tiền hoàn khoản giữ chỗ — ADR 0033.
 *
 * Sổ tài khoản ngân hàng đi theo CHỦ VÍ (ADR 0038 ràng buộc 6). Từ ADR 0053 điều 8 chủ ví của tiền
 * hoàn luôn là TÀI KHOẢN KHÁCH đã đặt chuyến — chủ xe đi thuê bằng một tài khoản khách riêng — nên
 * sổ ở đây luôn là sổ `account`.
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
  const tBank = useTranslations('BankAccounts');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  /*
   * Khoản hoàn LUÔN về tài khoản KHÁCH đã đặt chuyến (ADR 0053 điều 8 — server `refundBankOwner`
   * chỉ còn chủ `user`), nên sổ tài khoản nhận tiền luôn là sổ `account`.
   */
  const scope: BankAccountScope = BANK_ACCOUNT_SCOPE.ACCOUNT;

  const { data: accounts, isPending, isError } = useBankAccounts(scope, open);
  const provide = useProvideRefundAccount(tripId);
  const [formOpen, setFormOpen] = useState(false);

  /* Mỗi chủ MỘT tài khoản (PR #159): không còn bộ chọn, tiền hoàn về đúng tài khoản đang dùng. */
  const account = currentBankAccount(accounts);

  const submit = () => {
    if (!account || provide.isPending) return;
    provide.mutate(
      { bankAccountId: account.id },
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

          {isError ? <Callout tone="danger">{tBank('loadError')}</Callout> : null}

          {account ? <BankAccountCard account={account} emphasis /> : null}

          {/* Lối thêm/đổi chỉ hiện khi đã biết chắc có hay chưa có tài khoản — đúng web. */}
          {!isPending && !isError ? (
            <Button
              label={account ? tBank('actions.change') : tBank('actions.add')}
              icon={account ? 'swap-horizontal-outline' : 'add'}
              variant="ghost"
              disabled={provide.isPending}
              onPress={() => setFormOpen(true)}
            />
          ) : null}

          <Button
            icon="send-outline"
            label={t('submit')}
            size="lg"
            disabled={!account}
            loading={provide.isPending}
            onPress={submit}
          />
        </YStack>
      </BottomSheet>

      <BankAccountFormSheet
        scope={scope}
        open={formOpen}
        replacing={account}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}
