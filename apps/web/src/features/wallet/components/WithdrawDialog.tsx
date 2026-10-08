'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Alert, Button, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { CURRENCY_SUFFIX, formatMoneyInput, parseMoneyInput } from '@xeprime/domain';
import { API_ERROR_CODE } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { BankAccountCard } from '@/features/bank-accounts/components/BankAccountCard';
import { BankAccountForm } from '@/features/bank-accounts/components/BankAccountForm';
import { currentBankAccount } from '@/features/bank-accounts/current-account';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateWithdrawal, useWalletSummary } from '../hooks';
import type { WalletScope } from '../types';
import styles from './WithdrawDialog.module.css';

/**
 * Yêu cầu rút điểm về ngân hàng.
 *
 * Đích chuyển là TÀI KHOẢN NHẬN TIỀN đã lưu, không phải ba ô gõ tự do: gõ số tài khoản ngay tại
 * bước chi tiền là chỗ dễ sai nhất, và sai thì tiền đi mất chứ không báo lỗi. Mỗi chủ một tài
 * khoản (07/10/2026), nên không có gì để CHỌN — hộp thoại cho thấy tiền sẽ về đâu, và cho đổi ngay
 * tại chỗ nếu đó không còn là tài khoản đúng.
 *
 * Cam kết thời gian hiện ra TRƯỚC khi bấm gửi — đó là quy tắc (ADR 0025 điều 7), và con số lấy
 * từ server để web và app native không nói hai điều khác nhau.
 *
 * ## Hai chi tiết của ô số tiền
 *
 * Số gõ vào được nhóm nghìn NGAY khi gõ (`formatMoneyInput`) — cùng hàm mà mọi ô tiền khác trong
 * sản phẩm dùng. Một ô rút tiền hiện "2000000" là ô mà người dùng phải đếm số 0 bằng mắt, và
 * đếm nhầm một chữ số ở đây là một lệnh chuyển sai mười lần.
 *
 * Nút gửi dùng `type="primary"` mặc định của `ResponsiveDialog` — sắc gold chung của hệ, không
 * có màu riêng cho "màn tiền".
 */
export function WithdrawDialog({
  scope,
  open,
  onClose,
}: {
  scope: WalletScope;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Wallet.withdraw');
  const tAccounts = useTranslations('BankAccounts');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const summary = useWalletSummary(scope);
  const accountScope = scope === 'shop' ? 'shop' : 'account';
  const {
    data: accounts,
    isPending: accountsPending,
    isError: accountsError,
  } = useBankAccounts(accountScope);
  const create = useCreateWithdrawal(scope);

  const [amount, setAmount] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  // Đổi tài khoản ở hộp thoại con ghi thẳng tài khoản mới vào cache (`useCreateBankAccount`), nên
  // `account` luôn là đích hiện hành — không giữ id riêng có thể trỏ vào một tài khoản đã lưu trữ.
  const account = currentBankAccount(accounts);
  const chosen = account?.id ?? null;
  const available = summary.data?.available ?? '0';
  const min = summary.data?.minWithdrawAmount ?? '0';

  const parsed = parseMoneyInput(amount) ?? 0;
  const valid = parsed >= Number(min) && parsed <= Number(available) && Boolean(chosen);

  const submit = () => {
    if (!chosen || !valid || create.isPending) return;
    create.mutate(
      { amount: String(parsed), bankAccountId: chosen },
      {
        onSuccess: () => {
          message.success(t('created'));
          setAmount('');
          onClose();
        },
        onError: (err: unknown) => {
          message.error(errorMessage(err));
          // Tài khoản đã đổi ở nơi khác (tab khác, app native) ⇒ id trong thẻ đã bị lưu trữ. Tải
          // lại để thẻ hiện đúng đích hiện hành trước khi người dùng bấm gửi lần nữa.
          if (getErrorCode(err) === API_ERROR_CODE.NOT_FOUND) {
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
      <ResponsiveDialog
        title={t('title')}
        open={open}
        onClose={onClose}
        okText={t('submit')}
        onOk={submit}
        okDisabled={!valid}
        confirmLoading={create.isPending}
        size="sm"
      >
        <label className={styles.field}>
          <span className={styles.label}>{t('amount')}</span>
          <span className={styles.amountBox}>
            <input
              className={styles.input}
              inputMode="numeric"
              value={amount}
              placeholder="0"
              onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
              aria-describedby="withdraw-amount-hint"
            />
            {/* Đơn vị tiền KHÔNG dịch — tiền luôn là VND ở cả hai ngôn ngữ (ADR 0012). */}
            <span aria-hidden="true" className={styles.currency}>
              {CURRENCY_SUFFIX}
            </span>
          </span>
          <span id="withdraw-amount-hint" className={styles.hint}>
            {t('amountHint', { min: fmt.money(min), available: fmt.money(available) })}
          </span>
        </label>

        <p className={styles.label}>{t('account')}</p>
        {accountsPending ? <Skeleton active paragraph={{ rows: 1 }} /> : null}

        {accountsError ? (
          <Alert type="error" showIcon title={tAccounts('loadError')} />
        ) : null}

        {account ? (
          <BankAccountCard
            account={account}
            emphasis
            action={
              // Lối rẽ phụ, không tranh chỗ với nút gửi: đổi xong thì lệnh rút về tài khoản mới.
              <Button type="link" size="small" onClick={() => setFormOpen(true)}>
                {tAccounts('actions.change')}
              </Button>
            }
          />
        ) : null}

        {/*
          Chưa có tài khoản nào ⇒ ô TRỐNG bấm được, không phải một hộp "Không có dữ liệu" câm.
          Đây là bước bắt buộc để rút được tiền, nên nó phải là một lối đi chứ không phải một
          thông báo. Tải lỗi thì KHÔNG mời thêm: chưa biết người dùng đã có tài khoản hay chưa, và
          "thêm" lúc đó là âm thầm thay một tài khoản họ không thấy.
        */}
        {!accountsPending && !accountsError && !account ? (
          <button type="button" className={styles.addAccount} onClick={() => setFormOpen(true)}>
            <span aria-hidden="true" className={styles.addIcon}>
              <PlusOutlined />
            </span>
            {t('accountEmpty')}
          </button>
        ) : null}

        <Alert
          type="info"
          showIcon
          className={styles.commitment}
          title={t('commitment', { days: summary.data?.maxBusinessDays ?? 2 })}
        />
      </ResponsiveDialog>

      <BankAccountForm
        scope={accountScope}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        replacing={account}
      />
    </>
  );
}
