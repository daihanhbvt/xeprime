'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { compactPhoneInput, INTERNAL_DRIVER_NOTE_MAX } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateInternalDriver, useUpdateInternalDriver } from '../hooks/use-internal-drivers';
import { makeInternalDriverSchema, type InternalDriverFormValues } from '../schema';
import type { InternalDriver } from '../types';
import { DriverPhotoField } from './DriverPhotoField';

const EMPTY: InternalDriverFormValues = { name: '', phone: '', note: '', photoUrl: null };

/**
 * Form thêm / sửa một tài xế NỘI BỘ (ADR 0108) — Figma `24612:140670`: ảnh TUỲ CHỌN · SĐT · họ tên ·
 * ghi chú. Người nội bộ không có bằng lái hay tài khoản trên XePrime nên không có ô nào khác.
 *
 * Dạng hook để hai vỏ dùng chung một form: tab "Tài xế nội bộ" của hộp "Thêm tài xế mới" và hộp sửa
 * / thêm nhanh từ chi tiết đơn. Mỗi lần mở là một form mới — không mang giá trị của người A sang B.
 * Sửa tên/SĐT không viết lại các đơn đã gán (đơn giữ ảnh chụp lúc gán).
 */
export function useInternalDriverForm({
  open,
  driver,
  onDone,
}: {
  open: boolean;
  /** Có = sửa người này; null = thêm mới. */
  driver: InternalDriver | null;
  /** Lưu xong — nơi gọi đóng hộp và (bộ chọn trên đơn) gán ngay người vừa thêm. */
  onDone: (saved: InternalDriver) => void;
}): { form: ReactNode; submit: () => void; pending: boolean } {
  const t = useTranslations('Drivers');
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
    reset(
      driver
        ? {
            name: driver.name,
            phone: driver.phone,
            note: driver.note ?? '',
            photoUrl: driver.photoUrl ?? null,
          }
        : EMPTY,
    );
  }, [open, driver, reset]);

  const submit = handleSubmit((values) => {
    if (pending) return;
    const body = {
      name: values.name.trim(),
      phone: compactPhoneInput(values.phone),
      note: values.note.trim() || null,
      photoUrl: values.photoUrl ?? null,
    };
    const done = {
      onSuccess: (saved: InternalDriver) => {
        message.success(driver ? t('internal.toast.updated') : t('internal.toast.created'));
        onDone(saved);
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (driver) update.mutate({ id: driver.id, body }, done);
    else create.mutate(body, done);
  });

  const form = (
    <>
      {/*
        Ảnh đứng NGOÀI <form>: đặt `Upload` của AntD bên trong form làm ô SĐT không gõ được
        (28/11/2026). Nó vẫn ghi vào form qua `control`, nên vị trí DOM không đổi dữ liệu.
      */}
      <DriverPhotoField control={control} name="photoUrl" disabled={pending} />
      <DialogForm onSubmit={submit} labelPosition="top">
        <TextField
          control={control}
          name="phone"
          type="tel"
          label={t('add.internal.phone')}
          placeholder={t('add.internal.phonePlaceholder')}
          autoComplete="off"
        />
        <TextField
          control={control}
          name="name"
          label={t('add.internal.name')}
          placeholder={t('add.internal.namePlaceholder')}
          autoComplete="off"
        />
        <TextAreaField
          control={control}
          name="note"
          label={t('add.internal.note')}
          placeholder={t('add.internal.notePlaceholder')}
          rows={3}
          maxLength={INTERNAL_DRIVER_NOTE_MAX}
        />
        {driver && driver.activeTripCount > 0 ? (
          <p>{t('internal.form.snapshotNote', { count: driver.activeTripCount })}</p>
        ) : null}
      </DialogForm>
    </>
  );

  return { form, submit: () => void submit(), pending };
}
