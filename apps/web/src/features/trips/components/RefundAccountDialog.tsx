'use client';

import { App, Alert, Radio, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { BankAccountForm } from '@/features/bank-accounts/components/BankAccountForm';
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
 * Có tài khoản đã lưu thì CHỌN, chưa có thì khai một lần rồi hệ thống nhớ: bắt khách gõ lại số
 * tài khoản ở mỗi lần hoàn là cách chắc chắn nhất để có một chữ số sai trong một lệnh chuyển.
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
  const t = useTranslations('BankAccounts.refund');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const { data: accounts, isPending } = useBankAccounts('account');
  const provide = useProvideRefundAccount(tripId);
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const list = accounts ?? [];
  const chosen = selected ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null;

  const submit = () => {
    if (!chosen) return;
    provide.mutate(
      { bankAccountId: chosen },
      {
        onSuccess: () => {
          message.success(t('saved'));
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
        okDisabled={!chosen}
        confirmLoading={provide.isPending}
        size="sm"
      >
        <Alert type="info" showIcon message={t('intro', { amount })} className={styles.intro} />

        {isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}

        {!isPending && list.length > 0 ? (
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
                <span className={styles.name}>{account.accountName}</span>
              </Radio>
            ))}
          </Radio.Group>
        ) : null}

        <button type="button" className={styles.link} onClick={() => setFormOpen(true)}>
          {list.length > 0 ? t('useNew') : t('pickSaved')}
        </button>
      </ResponsiveDialog>

      {/* Khai xong thì chọn luôn tài khoản vừa thêm — không bắt người dùng tìm lại nó trong danh sách. */}
      <BankAccountForm
        scope="account"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(account) => setSelected(account.id)}
      />
    </>
  );
}
