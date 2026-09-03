'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { TENANT_ROLE, TENANT_ROLE_VALUES } from '@xeprime/types';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ASSIGNABLE_ROLES } from '../constants';
import { useAddMember } from '../hooks/use-member-mutations';

/**
 * Thêm thành viên theo email (user phải đã có tài khoản — mời-qua-email làm sau, cần SMTP).
 * Remount theo `open` để state form sạch mỗi lần mở.
 */
export function AddMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const add = useAddMember();

  // Schema dựng TRONG component: câu lỗi phải theo ngôn ngữ của request, mà module scope chạy
  // một lần cho cả tiến trình và sẽ đóng băng ngôn ngữ đầu tiên ở SSR.
  const schema = useMemo(
    () =>
      yup.object({
        email: yup
          .string()
          .trim()
          .required(t('form.errors.emailRequired'))
          .email(t('form.errors.emailInvalid')),
        roleKey: yup
          .string()
          .oneOf(TENANT_ROLE_VALUES.filter((r) => r !== TENANT_ROLE.SHOP_OWNER))
          .required(t('form.errors.roleRequired')),
      }),
    [t],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { email: '', roleKey: TENANT_ROLE.SHOP_STAFF },
  });

  const roleOptions = ASSIGNABLE_ROLES.map((role) => ({
    value: role,
    label: domainLabel('tenantRole', role),
  }));

  const onSubmit = handleSubmit((values) => {
    add.mutate(
      { email: values.email.trim(), roleKey: values.roleKey },
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
      title={t('form.title')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={tCommon('actions.add')}
      onOk={() => void onSubmit()}
      confirmLoading={add.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="sm">
        <TextField
          control={control}
          name="email"
          label={t('form.email')}
          type="email"
          placeholder={t('form.emailPlaceholder')}
        />
        <SelectField control={control} name="roleKey" label={t('form.role')} options={roleOptions} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
