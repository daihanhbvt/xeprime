'use client';

import { App, Descriptions } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { DialogForm } from '@/components/form/DialogForm';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useMarkWithdrawalPaid } from '../hooks/use-platform-money';
import type { PlatformWithdrawal } from '../types';
import styles from './WithdrawalPaidModal.module.css';

/** Cùng sàn/trần với `MarkWithdrawalPaidDto.bankReference`. */
const BANK_REFERENCE_MIN = 3;
const BANK_REFERENCE_MAX = 100;

/**
 * Xác nhận đã chuyển khoản cho một lệnh rút — điểm DUY NHẤT số dư thật sự giảm.
 *
 * Mã giao dịch ngân hàng là BẮT BUỘC: nó là đầu duy nhất của đối soát chiều RA, và database cũng
 * chặn một lệnh `paid` không có bằng chứng.
 *
 * `rowVersion` gửi kèm từ bản ghi admin đang nhìn: hai người cùng mở hàng đợi và cùng bấm thì
 * người sau nhận 409 thay vì chuyển tiền lần thứ hai.
 *
 * Form RESET mỗi khi mở một lệnh KHÁC — kể cả sau khi bấm Huỷ. Modal sống suốt đời màn hình; không
 * reset là lệnh B mở ra với mã giao dịch của lệnh A điền sẵn, nút bật sẵn.
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
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const markPaid = useMarkWithdrawalPaid();

  const schema = useMemo(
    () =>
      yup.object({
        bankReference: yup
          .string()
          .trim()
          .min(BANK_REFERENCE_MIN, t('referenceRequired'))
          .max(BANK_REFERENCE_MAX, tCommon('validation.maxLength', { max: BANK_REFERENCE_MAX }))
          .required(t('referenceRequired')),
      }),
    [t, tCommon],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { bankReference: '' },
  });

  const openId = open ? withdrawal?.id : undefined;
  useEffect(() => {
    if (openId) reset({ bankReference: '' });
  }, [openId, reset]);

  const onSubmit = handleSubmit((values) => {
    // Enter trong ô nhập gửi form kể cả khi nút OK đang quay — chặn lượt thứ hai ở đây.
    if (!withdrawal || markPaid.isPending) return;
    markPaid.mutate(
      {
        id: withdrawal.id,
        body: { bankReference: values.bankReference.trim(), rowVersion: withdrawal.rowVersion },
      },
      {
        onSuccess: () => {
          message.success(t('done'));
          onClose();
        },
        onError: (err: unknown) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('title')}
      open={open}
      onClose={onClose}
      okText={t('submit')}
      onOk={() => void onSubmit()}
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

      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField
          control={control}
          name="bankReference"
          label={t('bankReference')}
          required
          help={t('bankReferenceHint')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
