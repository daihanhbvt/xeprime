'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { DRIVER_TYPE, DRIVER_TYPE_VALUES } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { DateTimeField } from '@/components/form/DateTimeField';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateDriver, useUpdateDriver } from '../hooks/use-drivers';
import { makeDriverFormSchema, type DriverFormValues } from '../schema';
import type { Driver } from '../types';

const EMPTY: DriverFormValues = {
  name: '',
  phone: '',
  driverType: DRIVER_TYPE.STAFF,
  licenseNo: '',
  licenseExpiresAt: null,
  idNo: '',
  note: '',
};

function toValues(driver: Driver): DriverFormValues {
  return {
    name: driver.name,
    phone: driver.phone,
    driverType: (driver.driverType as DriverFormValues['driverType']) ?? DRIVER_TYPE.STAFF,
    licenseNo: driver.licenseNo ?? '',
    licenseExpiresAt: driver.licenseExpiresAt ?? null,
    idNo: driver.idNo ?? '',
    note: driver.note ?? '',
  };
}

/**
 * Hồ sơ tài xế — MỘT dialog cho cả thêm lẫn sửa (17/08, mức tối thiểu: hồ sơ + gán vào đơn).
 * Đổi trạng thái hoạt động/xoá nằm ở hàng bảng, không nhét vào form.
 */
export function DriverFormModal({
  open,
  driver,
  onClose,
}: {
  open: boolean;
  /** null = thêm mới; có giá trị = sửa hồ sơ đó. */
  driver: Driver | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const saving = create.isPending || update.isPending;

  // Schema dựng trong component để câu lỗi theo đúng ngôn ngữ của request — xem docblock ở
  // `../schema`.
  const schema = useMemo(() => makeDriverFormSchema(t as (key: string) => string), [t]);

  const { control, handleSubmit, reset } = useForm<DriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: EMPTY,
  });

  const driverTypeOptions = DRIVER_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('driverType', value),
  }));

  // Mỗi lần mở nạp lại đúng hồ sơ đang sửa (hoặc form trống) — bỏ dở lần trước không để lại rác.
  useEffect(() => {
    if (open) reset(driver ? toValues(driver) : EMPTY);
  }, [open, driver, reset]);

  const submit = handleSubmit((values) => {
    const body = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      driverType: values.driverType,
      licenseNo: values.licenseNo.trim() || null,
      licenseExpiresAt: values.licenseExpiresAt || null,
      idNo: values.idNo.trim() || null,
      note: values.note.trim() || null,
    };
    const done = {
      onSuccess: () => {
        message.success(driver ? t('toast.updated') : t('toast.created'));
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (driver) update.mutate({ id: driver.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={driver ? t('form.titleEdit') : t('form.titleCreate')}
      open={open}
      size="sm"
      okText={driver ? tCommon('actions.save') : tCommon('actions.add')}
      cancelText={tCommon('actions.close')}
      confirmLoading={saving}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="lg">
        <TextField
          control={control}
          name="name"
          label={t('form.name')}
          placeholder={t('form.namePlaceholder')}
        />
        <TextField
          control={control}
          name="phone"
          label={t('form.phone')}
          placeholder={t('form.phonePlaceholder')}
          autoComplete="tel"
        />
        <SelectField
          control={control}
          name="driverType"
          label={t('form.type')}
          options={driverTypeOptions}
        />
        <TextField control={control} name="licenseNo" label={t('form.licenseNo')} />
        <DateTimeField
          control={control}
          name="licenseExpiresAt"
          label={t('form.licenseExpiresAt')}
          dateOnly
          placeholder={t('form.licenseExpiresAtPlaceholder')}
        />
        <TextField control={control} name="idNo" label={t('form.idNo')} />
        <TextAreaField control={control} name="note" label={t('form.note')} rows={3} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
