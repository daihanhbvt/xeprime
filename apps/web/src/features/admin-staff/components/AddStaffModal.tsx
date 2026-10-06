'use client';

import { App, Alert } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { PLATFORM_ROLE, PLATFORM_ROLE_VALUES } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePlatformRoleOptions } from '../constants';
import { useAddStaff } from '../hooks/use-staff-mutations';
import styles from './AddStaffModal.module.css';

/** Cùng biên với `AddStaffDto.displayName` ở API (MinLength 2, MaxLength 120). */
const NAME_MIN = 2;
const NAME_MAX = 120;

function buildSchema(t: ReturnType<typeof useTranslations<'AdminStaff.add'>>) {
  return yup.object({
    email: yup.string().trim().required(t('errors.emailRequired')).email(t('errors.emailInvalid')),
    displayName: yup
      .string()
      .trim()
      .required(t('errors.nameRequired'))
      .min(NAME_MIN, t('errors.nameMin', { min: NAME_MIN }))
      .max(NAME_MAX, t('errors.nameMax', { max: NAME_MAX })),
    roleKey: yup.string().oneOf(PLATFORM_ROLE_VALUES).required(t('errors.roleRequired')),
  });
}

type FormValues = yup.InferType<ReturnType<typeof buildSchema>>;

/**
 * Thêm nhân sự nền tảng (B4 — ADR 0053 điều 3): email chưa có tài khoản QUẢN TRỊ thì API TẠO một
 * tài khoản realm `platform` mới và gửi link đặt mật khẩu; tài khoản khách/đối tác cùng email không
 * bao giờ được nâng quyền (chúng là tài khoản khác). Mọi lần thêm có audit ở API.
 *
 * Remount theo `open` để state form sạch mỗi lần mở.
 */
export function AddStaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('AdminStaff');
  const tAdd = useTranslations('AdminStaff.add');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const roleOptions = usePlatformRoleOptions();
  const add = useAddStaff();
  const schema = useMemo(() => buildSchema(tAdd), [tAdd]);
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { email: '', displayName: '', roleKey: PLATFORM_ROLE.PLATFORM_STAFF },
  });

  const onSubmit = handleSubmit((values) => {
    // Enter vẫn submit form khi nút OK đang quay — không gửi hai lần.
    if (add.isPending) return;
    add.mutate(
      { email: values.email.trim(), displayName: values.displayName.trim(), roleKey: values.roleKey },
      {
        onSuccess: () => {
          message.success(t('toast.added'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={tAdd('title')}
      open={open}
      onClose={onClose}
      okText={tAdd('submit')}
      onOk={() => void onSubmit()}
      confirmLoading={add.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="sm">
        <Alert className={styles.hint} type="info" showIcon title={tAdd('hint')} />
        <TextField
          control={control}
          name="email"
          label={tAdd('email')}
          type="email"
          placeholder={tAdd('emailPlaceholder')}
        />
        <TextField
          control={control}
          name="displayName"
          label={tAdd('displayName')}
          placeholder={tAdd('displayNamePlaceholder')}
        />
        <SelectField control={control} name="roleKey" label={tAdd('role')} options={roleOptions} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
