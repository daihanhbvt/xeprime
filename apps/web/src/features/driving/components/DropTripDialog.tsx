'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  DRIVER_DROP_NOTE_LENGTH,
  DRIVER_DROP_REASON,
  DRIVER_DROP_REASON_VALUES,
  DRIVER_DROP_ZONE,
  driverDropCooldownHours,
  driverDropPolicy,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useNow } from '@/hooks/use-now';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDropDriverTrip } from '../hooks';
import { makeDropTripSchema, type DropTripFormValues } from '../schema';
import type { DriverTrip } from '../types';
import styles from './Driving.module.css';

const EMPTY: DropTripFormValues = { reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE, reason: '' };

/**
 * "Báo sự cố / Rút khỏi chuyến" (ADR 0074) — chọn nhóm lý do, mô tả, và đọc trước hệ quả theo độ
 * sát giờ nhận (cùng `driverDropPolicy` mà server dùng; server vẫn là nơi chốt vùng khi bấm).
 * Đơn của khách KHÔNG bị huỷ — chủ xe được báo khẩn để gán tài xế khác.
 */
export function DropTripDialog({
  trip,
  open,
  onClose,
  onDropped,
}: {
  trip: Pick<DriverTrip, 'id' | 'code' | 'pickupAt' | 'releaseUntil'>;
  open: boolean;
  onClose: () => void;
  onDropped?: () => void;
}) {
  const t = useTranslations('Driving.drop');
  const tToast = useTranslations('Driving.toast');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const drop = useDropDriverTrip();
  const now = useNow(30_000);

  const schema = useMemo(
    () => makeDropTripSchema(t as (key: string, values?: Record<string, number>) => string),
    [t],
  );
  const { control, handleSubmit, reset } = useForm<DropTripFormValues>({
    resolver: yupResolver(schema),
    defaultValues: EMPTY,
  });
  const category = useWatch({ control, name: 'reasonCategory' });

  // Mỗi lần mở là một form mới — lý do của chuyến trước không theo sang chuyến này.
  useEffect(() => {
    if (open) {
      reset(EMPTY);
      drop.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip.id, reset]);

  const policy = driverDropPolicy({
    droppedAt: new Date(now),
    pickupAt: new Date(trip.pickupAt),
    releaseUntil: trip.releaseUntil ? new Date(trip.releaseUntil) : null,
  });
  const cooldownHours = driverDropCooldownHours(policy.zone);

  const submit = handleSubmit((values) => {
    if (drop.isPending) return;
    drop.mutate(
      {
        id: trip.id,
        body: { reasonCategory: values.reasonCategory, reason: values.reason.trim() || undefined },
      },
      {
        onSuccess: () => {
          message.success(tToast('tripDropped'));
          onClose();
          onDropped?.();
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('title', { code: trip.code })}
      open={open}
      size="sm"
      okText={t('confirm')}
      destructive
      cancelText={tCommon('actions.close')}
      confirmLoading={drop.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelPosition="top">
        <div className={styles.dialogHints}>
          <Alert type="info" showIcon title={t('keepsBooking')} />
          <Alert
            type={
              policy.zone === DRIVER_DROP_ZONE.CRITICAL
                ? 'error'
                : cooldownHours > 0
                  ? 'warning'
                  : 'info'
            }
            showIcon
            title={domainLabel('driverDropZone', policy.zone)}
            description={
              policy.zone === DRIVER_DROP_ZONE.GRACE
                ? t('penalty.grace')
                : policy.zone === DRIVER_DROP_ZONE.FAR
                  ? t('penalty.far')
                  : t('penalty.cooldown', { hours: cooldownHours })
            }
          />
          {drop.isError ? <Alert type="error" showIcon title={errorMessage(drop.error)} /> : null}
        </div>
        <RadioGroupField
          control={control}
          name="reasonCategory"
          label={t('reason')}
          required
          vertical
          options={DRIVER_DROP_REASON_VALUES.map((value) => ({
            value,
            label: domainLabel('driverDropReason', value),
          }))}
        />
        <TextAreaField
          control={control}
          name="reason"
          label={t('note')}
          placeholder={t('notePlaceholder')}
          rows={3}
          maxLength={DRIVER_DROP_NOTE_LENGTH.MAX}
          required={category === DRIVER_DROP_REASON.OTHER}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
