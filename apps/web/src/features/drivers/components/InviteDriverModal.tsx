'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { DRIVER_TYPE, DRIVER_TYPE_VALUES } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import styles from './DriverModals.module.css';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useInviteDriver } from '../hooks/use-drivers';
import { makeInviteDriverSchema, type InviteDriverFormValues } from '../schema';

const EMPTY: InviteDriverFormValues = {
  phone: '',
  name: '',
  driverType: DRIVER_TYPE.STAFF,
  note: '',
};

/**
 * Mời tài xế bằng SĐT (ADR 0063). Tài xế là TÀI KHOẢN KHÁCH đã xác minh — chưa có thì server trả
 * `DRIVER_ACCOUNT_NOT_FOUND` và câu lỗi (namespace `Errors`) nói rõ việc cần làm: nhờ tài xế đăng
 * ký bằng đúng số đó.
 */
export function InviteDriverModal({
  open,
  onClose,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  /** "Mời lại" từ một dòng đã từ chối / đã kết thúc — điền sẵn SĐT, tên, loại, ghi chú. */
  prefill?: InviteDriverFormValues | null;
}) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const invite = useInviteDriver();

  const schema = useMemo(() => makeInviteDriverSchema(t as (key: string) => string), [t]);
  const { control, handleSubmit, reset } = useForm<InviteDriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: EMPTY,
  });

  // Mỗi lần mở là một form mới (trống, hoặc điền sẵn khi mời lại) — lần mời dở trước không để lại rác.
  useEffect(() => {
    if (open) {
      reset(prefill ?? EMPTY);
      invite.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, reset]);

  const submit = handleSubmit((values) => {
    if (invite.isPending) return;
    invite.mutate(
      {
        phone: values.phone.trim(),
        name: values.name.trim(),
        driverType: values.driverType,
        note: values.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          message.success(t('toast.invited'));
          onClose();
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      title={prefill ? t('form.titleReinvite') : t('form.titleInvite')}
      open={open}
      size="sm"
      okText={t('actions.sendInvite')}
      cancelText={tCommon('actions.close')}
      confirmLoading={invite.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="sm">
        <div className={styles.hints}>
          <Alert type="info" showIcon title={t('form.inviteHint')} />
          {invite.isError ? (
            <Alert type="error" showIcon title={errorMessage(invite.error)} />
          ) : null}
        </div>
        <TextField
          control={control}
          name="phone"
          label={t('form.phone')}
          placeholder={t('form.phonePlaceholder')}
          autoComplete="tel"
        />
        <TextField
          control={control}
          name="name"
          label={t('form.name')}
          placeholder={t('form.namePlaceholder')}
        />
        <SelectField
          control={control}
          name="driverType"
          label={t('form.type')}
          options={DRIVER_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('driverType', value),
          }))}
        />
        <TextAreaField control={control} name="note" label={t('form.note')} rows={3} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
