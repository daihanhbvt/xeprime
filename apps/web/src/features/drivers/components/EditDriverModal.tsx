'use client';

import { UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { App, Form, Input } from 'antd';
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
import photoStyles from './DriverPhotoField.module.css';
import styles from './DriverModals.module.css';

function toValues(driver: Driver): EditDriverFormValues {
  return { name: driver.name, driverType: driver.driverType, note: driver.note ?? '' };
}

/**
 * Sửa tên gọi / hình thức / ghi chú của một liên kết — cùng khuôn với hộp sửa tài xế nội bộ (người
 * dùng 25/11/2026): nhãn trên ô, ảnh + SĐT ở đầu. Ảnh là ảnh TÀI KHOẢN của tài xế và SĐT là số tài
 * khoản nên chỉ xem — đổi người là mời lại (một liên kết mới).
 */
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

  const avatarUrl = driver?.account.avatarUrl ?? null;

  return (
    <ResponsiveDialog
      title={t('form.titleEdit')}
      open={driver !== null}
      size="sm"
      okText={t('add.internal.save')}
      cancelText={tCommon('actions.cancel')}
      confirmLoading={update.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelPosition="top">
        <div className={photoStyles.row}>
          <span className={photoStyles.tile}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh tài khoản, cỡ cố định
              <img src={avatarUrl} alt={t('add.internal.photoAlt')} className={photoStyles.image} />
            ) : (
              <UserOutlined className={photoStyles.placeholder} aria-hidden="true" />
            )}
          </span>
          <div className={photoStyles.side}>
            <span className={styles.accountName}>{driver?.account.displayName}</span>
            <span className={photoStyles.hint}>{t('form.accountPhotoHint')}</span>
          </div>
        </div>
        <Form.Item label={t('form.phone')}>
          <Input value={driver?.phone ?? ''} disabled aria-label={t('form.phone')} />
        </Form.Item>
        <TextField
          control={control}
          name="name"
          label={t('form.name')}
          placeholder={t('form.namePlaceholder')}
          autoComplete="off"
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
        <TextAreaField
          control={control}
          name="note"
          label={t('form.note')}
          placeholder={t('form.notePlaceholder')}
          rows={3}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
