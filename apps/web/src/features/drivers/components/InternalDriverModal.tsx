'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { compactPhoneInput, INTERNAL_DRIVER_NOTE_MAX } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateInternalDriver, useUpdateInternalDriver } from '../hooks/use-internal-drivers';
import { makeInternalDriverSchema, type InternalDriverFormValues } from '../schema';
import type { InternalDriver } from '../types';

const EMPTY: InternalDriverFormValues = { name: '', phone: '', note: '' };

/**
 * Thêm / sửa một tài xế NỘI BỘ (ADR 0108). Sửa tên/SĐT không viết lại các đơn đã gán — đơn giữ ảnh
 * chụp lúc gán. Đóng-mở lại là form mới, không mang giá trị của người A sang người B.
 */
export function InternalDriverModal({
  open,
  driver,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Có = sửa người này; null = thêm mới. */
  driver: InternalDriver | null;
  onClose: () => void;
  /** Gọi sau khi lưu xong — bộ chọn trên đơn dùng để gán ngay người vừa thêm. */
  onSaved?: (driver: InternalDriver) => void;
}) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const create = useCreateInternalDriver();
  const update = useUpdateInternalDriver();
  const pending = create.isPending || update.isPending;

  const schema = useMemo(() => makeInternalDriverSchema(t as (key: string) => string), [t]);
  const { control, handleSubmit, reset } = useForm<InternalDriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(driver ? { name: driver.name, phone: driver.phone, note: driver.note ?? '' } : EMPTY);
  }, [open, driver, reset]);

  const submit = handleSubmit((values) => {
    if (pending) return;
    const body = {
      name: values.name.trim(),
      phone: compactPhoneInput(values.phone),
      note: values.note.trim() || null,
    };
    const done = {
      onSuccess: (saved: InternalDriver) => {
        message.success(driver ? t('internal.toast.updated') : t('internal.toast.created'));
        onSaved?.(saved);
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (driver) update.mutate({ id: driver.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={driver ? t('internal.form.titleEdit') : t('internal.form.titleCreate')}
      open={open}
      size="sm"
      okText={tCommon('actions.save')}
      cancelText={tCommon('actions.close')}
      confirmLoading={pending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="lg">
        {driver ? null : <Alert type="info" showIcon title={t('internal.form.hint')} />}
        <TextField
          control={control}
          name="name"
          label={t('form.name')}
          placeholder={t('form.namePlaceholder')}
          autoComplete="off"
          required
        />
        <TextField
          control={control}
          name="phone"
          type="tel"
          label={t('internal.form.phone')}
          placeholder={t('internal.form.phonePlaceholder')}
          autoComplete="off"
          required
        />
        <TextAreaField
          control={control}
          name="note"
          label={t('form.note')}
          placeholder={t('internal.form.notePlaceholder')}
          rows={3}
          maxLength={INTERNAL_DRIVER_NOTE_MAX}
        />
        {driver && driver.activeTripCount > 0 ? (
          <p>{t('internal.form.snapshotNote', { count: driver.activeTripCount })}</p>
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
