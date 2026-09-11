'use client';

import { App, Alert, Empty, Radio, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { BankAccountForm } from '@/features/bank-accounts/components/BankAccountForm';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateWithdrawal, useWalletSummary } from '../hooks';
import type { WalletScope } from '../types';
import styles from './WithdrawDialog.module.css';

/**
 * Yêu cầu rút điểm về ngân hàng.
 *
 * Đích chuyển là một tài khoản ĐÃ LƯU, không phải ba ô gõ tự do: gõ số tài khoản ngay tại bước
 * chi tiền là chỗ dễ sai nhất, và sai thì tiền đi mất chứ không báo lỗi.
 *
 * Cam kết thời gian hiện ra TRƯỚC khi bấm gửi — đó là quy tắc (ADR 0025 điều 7), và con số lấy
 * từ server để web và app native không nói hai điều khác nhau.
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
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const summary = useWalletSummary(scope);
  const accountScope = scope === 'shop' ? 'shop' : 'account';
  const { data: accounts, isPending: accountsPending } = useBankAccounts(accountScope);
  const create = useCreateWithdrawal(scope);

  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = accounts ?? [];
  const chosen = selected ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null;
  const available = summary.data?.available ?? '0';
  const min = summary.data?.minWithdrawAmount ?? '0';

  const submit = () => {
    if (!chosen) return;
    create.mutate(
      { amount: amount.replace(/\D/g, ''), bankAccountId: chosen },
      {
        onSuccess: () => {
          message.success(t('created'));
          setAmount('');
          onClose();
        },
        onError: (err: unknown) => message.error(errorMessage(err)),
      },
    );
  };

  const parsed = Number(amount.replace(/\D/g, '') || 0);
  const valid = parsed >= Number(min) && parsed <= Number(available) && Boolean(chosen);

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
          <input
            className={styles.input}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="withdraw-amount-hint"
          />
          <span id="withdraw-amount-hint" className={styles.hint}>
            {t('amountHint', { min: fmt.money(min), available: fmt.money(available) })}
          </span>
        </label>

        <p className={styles.label}>{t('account')}</p>
        {accountsPending ? <Skeleton active paragraph={{ rows: 1 }} /> : null}

        {!accountsPending && list.length === 0 ? (
          <Empty description={t('accountEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}

        {list.length > 0 ? (
          <Radio.Group
            className={styles.group}
            value={chosen}
            onChange={(e) => setSelected(e.target.value as string)}
          >
            {list.map((account) => (
              <Radio key={account.id} value={account.id} className={styles.option}>
                <span className={styles.bank}>{account.label || account.bankCode}</span>
                <span className={styles.number}>
                  {account.bankCode} · {account.accountNumberMasked}
                </span>
              </Radio>
            ))}
          </Radio.Group>
        ) : null}

        <button type="button" className={styles.link} onClick={() => setFormOpen(true)}>
          {t('addAccount')}
        </button>

        <Alert
          type="info"
          showIcon
          className={styles.commitment}
          message={t('commitment', { days: summary.data?.maxBusinessDays ?? 2 })}
        />
      </ResponsiveDialog>

      <BankAccountForm
        scope={accountScope}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(account) => setSelected(account.id)}
      />
    </>
  );
}
