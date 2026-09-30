import { useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { bankDisplayName } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { FieldLabel } from '@/components/ui/Field';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { RadioOption } from '@/components/ui/RadioOption';
import { MoneyControl } from '@/components/ui/MoneyControl';
import { BankAccountFormSheet } from '@/features/bank-accounts/components/BankAccountFormSheet';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { BANK_ACCOUNT_SCOPE, type BankAccountScope } from '@/api/bank-accounts/api';
import { WALLET_SCOPE, type WalletScope } from '@/api/wallet/api';
import { useCreateWithdrawal, useWalletSummary } from '../hooks/use-wallet';

/** Cam kết mặc định khi server chưa nói — cùng con số dự phòng với web. */
const FALLBACK_BUSINESS_DAYS = 2;

/**
 * Yêu cầu rút điểm về ngân hàng — bản native của `WithdrawDialog`.
 *
 * Đích chuyển là một tài khoản ĐÃ LƯU, không phải ba ô gõ tự do: gõ số tài khoản ngay tại bước
 * chi tiền là chỗ dễ sai nhất, và sai thì tiền đi mất chứ không báo lỗi.
 *
 * Cam kết thời gian hiện ra TRƯỚC khi bấm gửi — đó là quy tắc (ADR 0025 điều 7), và con số lấy từ
 * server để web và app native không nói hai điều khác nhau.
 */
export function WithdrawSheet({
  scope,
  open,
  onClose,
}: {
  scope: WalletScope;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Wallet.withdraw');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const summary = useWalletSummary(scope);
  /* Ví gian hàng rút về tài khoản của GIAN HÀNG; ví cá nhân về tài khoản cá nhân — hai sổ khác. */
  const accountScope: BankAccountScope =
    scope === WALLET_SCOPE.SHOP ? BANK_ACCOUNT_SCOPE.SHOP : BANK_ACCOUNT_SCOPE.ACCOUNT;
  const accounts = useBankAccounts(accountScope);
  const create = useCreateWithdrawal(scope);

  /* `null` = chưa gõ gì, khác `0` = gõ số không — nút gửi khoá ở cả hai, nhưng ô thì khác. */
  const [amount, setAmount] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = accounts.data ?? [];
  /* Mặc định: cái người dùng vừa chọn → tài khoản mặc định → cái đầu tiên. */
  const chosen = selected ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null;

  const available = summary.data?.available ?? '0';
  const min = summary.data?.minWithdrawAmount ?? '0';

  const parsed = amount ?? 0;
  const valid = parsed >= Number(min) && parsed <= Number(available) && Boolean(chosen);

  const close = () => {
    setAmount(null);
    onClose();
  };

  const submit = () => {
    /*
     * Chốt cả `valid`, không chỉ `chosen`: nút đã khoá theo `valid` rồi, nhưng một sheet còn mở
     * trong lúc `available` tụt xuống (một lệnh rút khác vừa được duyệt) thì lần bấm sau đó gửi
     * đi một số tiền vượt số dư. Rẻ hơn nhiều so với một lệnh rút phải huỷ tay.
     */
    if (!chosen || !valid) return;
    create.mutate(
      { amount: String(parsed), bankAccountId: chosen },
      {
        onSuccess: () => {
          toast.showSuccess(t('created'));
          setAmount(null);
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  };

  return (
    <>
      <BottomSheet open={open} onClose={close} title={t('title')}>
        <YStack gap={space.md}>
          {/*
            Ô TIỀN, không phải một ô chữ tự lọc chữ số: số gõ vào được nhóm nghìn NGAY khi gõ —
            cùng ô mà mọi khoản tiền khác trong sản phẩm dùng. Phải đếm số 0 bằng mắt ở đúng màn
            chi tiền là chỗ một chữ số lệch thành một lệnh chuyển sai gấp mười lần.
          */}
          <MoneyControl
            label={t('amount')}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            hint={t('amountHint', { min: fmt.money(min), available: fmt.money(available) })}
            required
          />

          <YStack gap={space.xs}>
            <FieldLabel label={t('account')} required />

            {accounts.isLoading ? <MiniRowsSkeleton rows={2} /> : null}

            {list.length > 0 ? (
              <YStack gap={space.xs}>
                {list.map((account) => (
                  <RadioOption
                    key={account.id}
                    label={account.label || bankDisplayName(account.bankCode)}
                    /*
                      Ba mẩu, đúng ba mẩu mà web hiện: ngân hàng · số tài khoản · TÊN CHỦ. Tên chủ
                      là thứ người ta soát lại lần cuối trước khi tiền rời đi — một số tài khoản
                      đúng ngân hàng nhưng sai người thì vẫn là tiền mất.
                    */
                    hint={`${bankDisplayName(account.bankCode)} · ${t('accountNumber', {
                      number: account.accountNumberMasked,
                    })} · ${account.accountName}`}
                    checked={account.id === chosen}
                    onPress={() => setSelected(account.id)}
                  />
                ))}
              </YStack>
            ) : null}

            {/*
              Chưa có tài khoản nào ⇒ chính nút này ĐỔI NHÃN thành lời mời khai, thay cho một dòng
              "chưa có gì" nằm trên một nút. Đây là bước bắt buộc để rút được tiền, nên nó phải là
              một lối đi chứ không phải một thông báo — đúng như web.
            */}
            {!accounts.isLoading ? (
              <Button
                label={list.length === 0 ? t('accountEmpty') : t('addAccount')}
                variant="ghost"
                size="sm"
                icon="add"
                onPress={() => setFormOpen(true)}
              />
            ) : null}
          </YStack>

          {/* Cam kết thời gian chuyển — đọc được TRƯỚC khi gửi, không phải sau (ADR 0025 điều 7). */}
          <Callout tone="info">
            {t('commitment', { days: summary.data?.maxBusinessDays ?? FALLBACK_BUSINESS_DAYS })}
          </Callout>

          <YStack gap={space.sm}>
            <Button
              label={t('submit')}
              disabled={!valid}
              loading={create.isPending}
              onPress={submit}
            />
            <Button
              label={tCommon('cancel')}
              variant="ghost"
              disabled={create.isPending}
              onPress={close}
            />
          </YStack>
        </YStack>
      </BottomSheet>

      {/* Khai xong là CHỌN LUÔN tài khoản mới — khách đang ở giữa luồng rút, đừng bắt tìm lại. */}
      <BankAccountFormSheet
        scope={accountScope}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(account) => setSelected(account.id)}
      />
    </>
  );
}
