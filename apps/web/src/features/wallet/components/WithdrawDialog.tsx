'use client';

import { PlusOutlined } from '@ant-design/icons';
import { App, Alert, Radio, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CURRENCY_SUFFIX,
  bankDisplayName,
  bankInitials,
  formatMoneyInput,
  parseMoneyInput,
} from '@xeprime/domain';
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

  const parsed = parseMoneyInput(amount) ?? 0;
  const valid = parsed >= Number(min) && parsed <= Number(available) && Boolean(chosen);

  const submit = () => {
    if (!chosen || !valid) return;
    create.mutate(
      { amount: String(parsed), bankAccountId: chosen },
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

        {list.length > 0 ? (
          <Radio.Group
            className={styles.group}
            value={chosen}
            onChange={(e) => setSelected(e.target.value as string)}
          >
            {list.map((account) => (
              <Radio key={account.id} value={account.id} className={styles.option}>
                <span aria-hidden="true" className={styles.badge}>
                  {bankInitials(account.bankCode)}
                </span>
                <span className={styles.accountText}>
                  <span className={styles.bank}>
                    {account.label || bankDisplayName(account.bankCode)}
                  </span>
                  <span className={styles.number}>
                    {t('accountNumber', { number: account.accountNumberMasked })}
                  </span>
                  <span className={styles.holder}>{account.accountName}</span>
                </span>
              </Radio>
            ))}
          </Radio.Group>
        ) : null}

        {/*
          Chưa có tài khoản nào ⇒ ô TRỐNG bấm được, không phải một hộp "Không có dữ liệu" câm.
          Đây là bước bắt buộc để rút được tiền, nên nó phải là một lối đi chứ không phải một
          thông báo.
        */}
        {!accountsPending ? (
          <button type="button" className={styles.addAccount} onClick={() => setFormOpen(true)}>
            <span aria-hidden="true" className={styles.addIcon}>
              <PlusOutlined />
            </span>
            {list.length === 0 ? t('accountEmpty') : t('addAccount')}
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
        onCreated={(account) => setSelected(account.id)}
      />
    </>
  );
}
