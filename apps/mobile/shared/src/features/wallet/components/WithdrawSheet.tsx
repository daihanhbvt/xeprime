import { useState } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorCode } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoHint } from '@/components/ui/InfoHint';
import { SheetConfirmFooter } from '@/components/ui/SheetConfirmFooter';
import { FieldLabel } from '@/components/ui/Field';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { MoneyControl } from '@/components/ui/MoneyControl';
import { BankAccountInline } from '@/features/bank-accounts/components/BankAccountInline';
import { BankAccountFormSheet } from '@/features/bank-accounts/components/BankAccountFormSheet';
import { currentBankAccount } from '@/features/bank-accounts/current-account';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/queries/query-keys';
import { space } from '@/theme/tokens';
import { BANK_ACCOUNT_SCOPE, type BankAccountScope } from '@/api/bank-accounts/api';
import { WALLET_SCOPE, type WalletScope } from '@/api/wallet/api';
import { useCreateWithdrawal, useWalletSummary } from '../hooks/use-wallet';

/** Cam kết mặc định khi server chưa nói — cùng con số dự phòng với web. */
const FALLBACK_BUSINESS_DAYS = 2;

/**
 * Yêu cầu rút điểm về ngân hàng — bản native của `WithdrawDialog`.
 *
 * Đích chuyển là tài khoản nhận tiền ĐANG DÙNG (mỗi chủ một tài khoản — PR #159), hiện thành một
 * thẻ kèm lối "Đổi tài khoản"; không còn bộ chọn. Gõ số tài khoản ngay tại bước chi tiền là chỗ
 * dễ sai nhất, nên đích luôn là một tài khoản đã lưu.
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
  const tBank = useTranslations('BankAccounts');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const summary = useWalletSummary(scope);
  /* Ví gian hàng rút về tài khoản của GIAN HÀNG; ví cá nhân về tài khoản cá nhân — hai sổ khác. */
  const accountScope: BankAccountScope =
    scope === WALLET_SCOPE.SHOP ? BANK_ACCOUNT_SCOPE.SHOP : BANK_ACCOUNT_SCOPE.ACCOUNT;
  const accounts = useBankAccounts(accountScope);
  const create = useCreateWithdrawal(scope);

  /* `null` = chưa gõ gì, khác `0` = gõ số không — nút gửi khoá ở cả hai, nhưng ô thì khác. */
  const [amount, setAmount] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const account = currentBankAccount(accounts.data);
  const chosen = account?.id ?? null;

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
    if (!chosen || !valid || create.isPending) return;
    create.mutate(
      { amount: String(parsed), bankAccountId: chosen },
      {
        onSuccess: () => {
          toast.showSuccess(t('created'));
          setAmount(null);
          onClose();
        },
        onError: (error) => {
          toast.showError(errorMessage(error));
          /*
           * Tài khoản đã đổi ở nơi khác (web, máy khác) ⇒ id trong thẻ đã bị lưu trữ. Tải lại để
           * thẻ hiện đúng đích hiện hành trước khi người dùng bấm gửi lần nữa — đúng web.
           */
          if (getErrorCode(error) === API_ERROR_CODE.NOT_FOUND) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.bankAccounts.list(accountScope),
            });
          }
        },
      },
    );
  };

  return (
    <>
      {/*
        Cùng khung các tấm của app Partner (`chrome="v2"` + kẻ dưới tiêu đề). Chân tấm
        là "Huỷ" (trái) + "Gửi yêu cầu rút", không icon (người dùng chốt 26/11/2026).
      */}
      <BottomSheet
        open={open}
        onClose={close}
        chrome="v2"
        headerDivider
        title={t('title')}
        /*
          Cam kết thời gian chuyển ở ⓘ cạnh tiêu đề (người dùng chốt 26/11/2026, thay khung xanh) -
          vẫn đọc được TRƯỚC khi bấm gửi (ADR 0025 điều 7).
        */
        titleAdornment={
          <InfoHint
            label={t('title')}
            content={t('commitment', {
              days: summary.data?.maxBusinessDays ?? FALLBACK_BUSINESS_DAYS,
            })}
          />
        }
        footer={
          <SheetConfirmFooter
            backLabel={tCommon('cancel')}
            onBack={close}
            confirmLabel={t('submit')}
            onConfirm={submit}
            tone="primary"
            disabled={!valid}
            loading={create.isPending}
          />
        }
      >
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

            {accounts.isError ? <Callout tone="danger">{tBank('loadError')}</Callout> : null}

            {/*
              Thẻ gọn như khối "Tài khoản nhận tiền" của ví. KHÔNG có nút đổi ở đây - đổi tài khoản
              là việc của khối đó trên màn ví (yêu cầu đổi + xác minh), không nằm giữa luồng rút.
            */}
            {account ? <BankAccountInline account={account} /> : null}

            {/*
              Chưa có tài khoản ⇒ lời mời khai thay cho một dòng "chưa có gì": đây là bước bắt
              buộc để rút được tiền, nên nó phải là một lối đi — đúng như web.
            */}
            {!accounts.isLoading && !accounts.isError && !account ? (
              <Button
                label={t('accountEmpty')}
                variant="secondary"
                size="sm"
                onPress={() => setFormOpen(true)}
              />
            ) : null}
          </YStack>


        </YStack>
      </BottomSheet>

      {/* Khai/đổi xong, danh sách được làm mới và thẻ tự trỏ vào tài khoản mới. */}
      <BankAccountFormSheet
        scope={accountScope}
        open={formOpen}
        replacing={account}
        onClose={() => setFormOpen(false)}
      />
    </>
  );
}
