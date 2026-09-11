'use client';

import { App, Alert, Descriptions } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useMarkWithdrawalPaid } from '../hooks/use-platform-money';
import type { PlatformWithdrawal } from '../types';
import styles from './WithdrawalPaidModal.module.css';

/**
 * Xác nhận đã chuyển khoản cho một lệnh rút — điểm DUY NHẤT số dư thật sự giảm.
 *
 * Mã giao dịch ngân hàng là BẮT BUỘC: nó là đầu duy nhất của đối soát chiều RA, và database cũng
 * chặn một lệnh `paid` không có bằng chứng. Nút chỉ bật khi đã gõ mã.
 *
 * `rowVersion` gửi kèm từ bản ghi admin đang nhìn: hai người cùng mở hàng đợi và cùng bấm thì
 * người sau nhận 409 thay vì chuyển tiền lần thứ hai.
 */
export function WithdrawalPaidModal({
  withdrawal,
  open,
  onClose,
}: {
  withdrawal: PlatformWithdrawal | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Wallet.admin.paid');
  const tCol = useTranslations('Wallet.admin.columns');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const markPaid = useMarkWithdrawalPaid();

  const [reference, setReference] = useState('');

  const submit = () => {
    if (!withdrawal || reference.trim().length < 3) return;
    markPaid.mutate(
      {
        id: withdrawal.id,
        body: { bankReference: reference.trim(), rowVersion: withdrawal.rowVersion },
      },
      {
        onSuccess: () => {
          message.success(t('done'));
          setReference('');
          onClose();
        },
        onError: (err: unknown) => message.error(errorMessage(err)),
      },
    );
  };

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      okText={t('submit')}
      onOk={submit}
      okDisabled={reference.trim().length < 3}
      confirmLoading={markPaid.isPending}
      size="sm"
    >
      {withdrawal ? (
        <Descriptions size="small" column={1} className={styles.info}>
          <Descriptions.Item label={tCol('amount')}>
            {fmt.money(withdrawal.amount)}
          </Descriptions.Item>
          <Descriptions.Item label={tCol('account')}>
            {withdrawal.bankCode} · {withdrawal.bankAccountNumber}
            <br />
            {withdrawal.bankAccountName}
          </Descriptions.Item>
          <Descriptions.Item label={tCol('code')}>{withdrawal.code}</Descriptions.Item>
        </Descriptions>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>{t('bankReference')}</span>
        <input
          className={styles.input}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          aria-describedby="withdrawal-reference-hint"
        />
      </label>
      <Alert
        id="withdrawal-reference-hint"
        type="info"
        showIcon
        message={t('bankReferenceHint')}
      />
    </ResponsiveDialog>
  );
}
