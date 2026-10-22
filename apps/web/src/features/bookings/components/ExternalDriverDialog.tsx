'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { EXTERNAL_DRIVER_NAME_LENGTH } from '@xeprime/types';
import { buildExternalDriverSchema, type ExternalDriverFormValues } from '@xeprime/validators';
import { DialogForm } from '@/components/form/DialogForm';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import styles from './BookingDriverSection.module.css';

const EMPTY: ExternalDriverFormValues = { name: '', phone: '' };

/**
 * Ghi / sửa tài xế NGOÀI HỆ THỐNG trên một đơn (ADR 0067): tên + SĐT di động, không tài khoản,
 * coi là đã nhận ngay khi lưu. Đơn đang có tài xế liên kết thì người đó bị gỡ và được báo — hộp
 * thoại nói trước điều đó.
 */
export function ExternalDriverDialog({
  open,
  bookingId,
  current,
  replacingLinkedName,
  onClose,
}: {
  open: boolean;
  bookingId: string;
  /** Tài xế ngoài hệ thống đang ghi trên đơn — điền sẵn khi sửa. */
  current: ExternalDriverFormValues | null;
  /** Tên tài xế LIÊN KẾT đang gán (sẽ bị gỡ khi lưu) — `null` khi không có. */
  replacingLinkedName: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.booking');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const assign = useAssignBookingDriver(bookingId);

  const schema = useMemo(
    () =>
      buildExternalDriverSchema({
        nameRequired: t('externalForm.nameRequired'),
        nameLength: t('externalForm.nameLength', {
          min: EXTERNAL_DRIVER_NAME_LENGTH.MIN,
          max: EXTERNAL_DRIVER_NAME_LENGTH.MAX,
        }),
        phoneRequired: t('externalForm.phoneRequired'),
        phoneInvalid: t('externalForm.phoneInvalid'),
      }),
    [t],
  );
  const { control, handleSubmit, reset } = useForm<ExternalDriverFormValues>({
    resolver: yupResolver(schema),
    defaultValues: current ?? EMPTY,
  });

  // Mỗi lần mở là một form mới — lần nhập dở trước (hay của đơn khác) không để lại rác.
  useEffect(() => {
    if (open) {
      reset(current ?? EMPTY);
      assign.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.name, current?.phone, reset]);

  const submit = handleSubmit((values) => {
    if (assign.isPending) return;
    assign.mutate(
      { externalDriver: { name: values.name, phone: values.phone } },
      {
        onSuccess: () => {
          message.success(t('externalSaved'));
          onClose();
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('externalForm.title')}
      open={open}
      size="sm"
      okText={t('externalForm.save')}
      cancelText={tCommon('actions.cancel')}
      confirmLoading={assign.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="sm">
        <div className={styles.hints}>
          <Alert type="info" showIcon title={t('externalForm.hint')} />
          {replacingLinkedName ? (
            <Alert
              type="warning"
              showIcon
              title={t('externalForm.replaceLinked', { name: replacingLinkedName })}
            />
          ) : null}
          {assign.isError ? (
            <Alert type="error" showIcon title={errorMessage(assign.error)} />
          ) : null}
        </div>
        <TextField
          control={control}
          name="name"
          label={t('externalForm.name')}
          placeholder={t('externalForm.namePlaceholder')}
          autoComplete="off"
        />
        <TextField
          control={control}
          name="phone"
          type="tel"
          label={t('externalForm.phone')}
          placeholder={t('externalForm.phonePlaceholder')}
          autoComplete="off"
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
