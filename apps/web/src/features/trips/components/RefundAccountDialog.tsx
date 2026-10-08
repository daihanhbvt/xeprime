'use client';

import { App, Alert, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { BankAccountCard } from '@/features/bank-accounts/components/BankAccountCard';
import { BankAccountForm } from '@/features/bank-accounts/components/BankAccountForm';
import { currentBankAccount } from '@/features/bank-accounts/current-account';
import { useBankAccounts } from '@/features/bank-accounts/hooks/use-bank-accounts';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useProvideRefundAccount } from '../hooks';
import styles from './RefundAccountDialog.module.css';

/**
 * Khách khai tài khoản nhận tiền hoàn — mảnh còn thiếu khiến luồng hoàn tiền tắc (ADR 0033).
 *
 * Trước đợt này màn chuyến chỉ NÓI "có khoản chờ hoàn, liên hệ hỗ trợ" mà không có ô nào để
 * khai, còn admin thì không bấm được "đã chuyển" vì lệnh chuyển không có đích. Đây là chỗ nối
 * hai đầu đó lại.
 *
 * Có tài khoản nhận tiền thì XÁC NHẬN nó, chưa có thì khai một lần rồi hệ thống nhớ: bắt khách gõ
 * lại số tài khoản ở mỗi lần hoàn là cách chắc chắn nhất để có một chữ số sai trong một lệnh
 * chuyển. Mỗi chủ một tài khoản (07/10/2026): "dùng tài khoản khác" là ĐỔI tài khoản nhận tiền,
 * không phải thêm một dòng vào sổ.
 *
 * ## Sổ tài khoản nào
 *
 * Luôn sổ `account` của chính TÀI KHOẢN KHÁCH đã đặt chuyến — đúng luật server dùng
 * (`refundBankOwner` → `resolveRefundWalletOwner`, ADR 0053 điều 8). Màn này chỉ sống ở site khách,
 * nơi `/shop/bank-accounts` (realm partner) vốn không gọi được; đọc sổ khác là một `404` giữa luồng
 * khai đích cho một lệnh chuyển tiền.
 */
export function RefundAccountDialog({
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
  const t = useTranslations('BankAccounts');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const { data: accounts, isPending, isError } = useBankAccounts('account');
  const provide = useProvideRefundAccount(tripId);
  const [formOpen, setFormOpen] = useState(false);

  // Đổi ở hộp thoại con ghi thẳng tài khoản mới vào cache — `account` luôn là đích hiện hành.
  const account = currentBankAccount(accounts);
  const chosen = account?.id ?? null;

  const submit = () => {
    if (!chosen || provide.isPending) return;
    provide.mutate(
      { bankAccountId: chosen },
      {
        onSuccess: () => {
          message.success(t('refund.saved'));
          onClose();
        },
        onError: (err: unknown) => message.error(errorMessage(err)),
      },
    );
  };

  return (
    <>
      <ResponsiveDialog
        title={t('refund.title')}
        open={open}
        onClose={onClose}
        okText={t('refund.submit')}
        onOk={submit}
        okDisabled={!chosen}
        confirmLoading={provide.isPending}
        size="sm"
      >
        <Alert
          type="info"
          showIcon
          title={t('refund.intro', { amount })}
          className={styles.intro}
        />

        {isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
        {isError ? <Alert type="error" showIcon title={t('loadError')} /> : null}
        {account ? <BankAccountCard account={account} /> : null}

        {/*
          Tải lỗi thì không mời thêm/đổi: chưa biết khách đã có tài khoản hay chưa, và khai lúc đó
          là âm thầm thay một tài khoản họ không thấy.
        */}
        {!isPending && !isError ? (
          <button type="button" className={styles.link} onClick={() => setFormOpen(true)}>
            {account ? t('actions.change') : t('actions.add')}
          </button>
        ) : null}
      </ResponsiveDialog>

      <BankAccountForm
        scope="account"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        replacing={account}
      />
    </>
  );
}
