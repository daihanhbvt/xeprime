'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { DRIVER_TYPE_VALUES } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUpdateDriver } from '../hooks/use-drivers';
import { makeEditDriverSchema, type EditDriverFormValues } from '../schema';
import type { Driver } from '../types';

function toValues(driver: Driver): EditDriverFormValues {
  return { name: driver.name, driverType: driver.driverType, note: driver.note ?? '' };
}

/** Sửa tên gọi / loại / ghi chú của một liên kết. SĐT không sửa được — mời lại là liên kết mới. */
export function EditDriverModal({
  driver,
  onClose,
}: {
  /** null = đóng. */
  driver: Driver | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const update = useUpdateDriver();

  const schema = useMemo(() => makeEditDriverSchema(t as (key: string) => string), [t]);
  const { control, handleSubmit, reset } = useForm<EditDriverFormValues>({
    resolver: yupResolver(schema),
  });

  // Đổi bản ghi là nạp lại form — không mang giá trị của tài xế A sang tài xế B.
  useEffect(() => {
    if (driver) reset(toValues(driver));
  }, [driver, reset]);

  const submit = handleSubmit((values) => {
    if (!driver || update.isPending) return;
    update.mutate(
      {
        id: driver.id,
        body: {
          name: values.name.trim(),
          driverType: values.driverType,
          note: values.note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          message.success(t('toast.updated'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('form.titleEdit')}
      open={driver !== null}
      size="sm"
      okText={tCommon('actions.save')}
      cancelText={tCommon('actions.close')}
      confirmLoading={update.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="lg">
        <TextField control={control} name="name" label={t('form.name')} />
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
