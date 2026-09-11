'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { DialogForm } from '@/components/form/DialogForm';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateBankAccount } from '../hooks/use-bank-accounts';
import type { BankAccount, BankAccountScope } from '../types';

/**
 * Khai một tài khoản nhận tiền.
 *
 * Ba ô bắt buộc, không có ô nào tuỳ tiện: mã ngân hàng và số tài khoản dựng nên lệnh chuyển,
 * còn TÊN CHỦ TÀI KHOẢN là thứ ngân hàng đối chiếu — sai tên thì lệnh bị trả về và tiền quay
 * lại sau vài ngày mà không ai biết vì sao. Vì thế ô tên có dòng nhắc riêng.
 *
 * Không cho sửa một tài khoản đã lưu: đổi số tài khoản tại chỗ sẽ âm thầm đổi đích của những
 * lệnh chuyển đang chờ. Muốn đổi thì thêm cái mới và bỏ cái cũ — hai hành động nhìn thấy được.
 */
export function BankAccountForm({
  scope,
  open,
  onClose,
  onCreated,
}: {
  scope: BankAccountScope;
  open: boolean;
  onClose: () => void;
  onCreated?: (account: BankAccount) => void;
}) {
  const t = useTranslations('BankAccounts.form');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const create = useCreateBankAccount(scope);

  const schema = useMemo(
    () =>
      yup.object({
        bankCode: yup.string().trim().required(t('validation.bankRequired')).max(20),
        accountNumber: yup
          .string()
          .trim()
          .required(t('validation.numberRequired'))
          // Cho phép khoảng trắng khi gõ/dán; server chuẩn hoá bỏ chúng trước khi lưu.
          .matches(/^[0-9\s]+$/, t('validation.numberDigits'))
          .max(40),
        accountName: yup.string().trim().required(t('validation.nameRequired')).max(160),
        label: yup.string().trim().max(60).default(''),
        isDefault: yup.boolean().required(),
      }),
    [t],
  );

  const { control, handleSubmit, reset } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      bankCode: '',
      accountNumber: '',
      accountName: '',
      label: '',
      isDefault: false,
    },
  });

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        bankCode: values.bankCode,
        accountNumber: values.accountNumber,
        accountName: values.accountName,
        ...(values.label ? { label: values.label } : {}),
        isDefault: values.isDefault,
      },
      {
        onSuccess: (account) => {
          message.success(t('created'));
          reset();
          onCreated?.(account);
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
      confirmLoading={create.isPending}
      size="sm"
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField
          control={control}
          name="bankCode"
          label={t('bankCode')}
          placeholder={t('bankCodePlaceholder')}
        />
        <TextField control={control} name="accountNumber" label={t('accountNumber')} />
        <TextField
          control={control}
          name="accountName"
          label={t('accountName')}
          help={t('accountNameHint')}
        />
        <TextField
          control={control}
          name="label"
          label={t('label')}
          placeholder={t('labelPlaceholder')}
        />
        <SwitchField control={control} name="isDefault" label={t('isDefault')} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
