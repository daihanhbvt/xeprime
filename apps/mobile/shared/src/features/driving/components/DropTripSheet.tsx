import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_DROP_NOTE_LENGTH,
  DRIVER_DROP_REASON,
  DRIVER_DROP_REASON_VALUES,
  DRIVER_DROP_ZONE,
  driverDropCooldownHours,
  driverDropPolicy,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { RadioField } from '@/components/ui/RadioField';
import { TextField } from '@/components/ui/TextField';
import { useNow } from '@/hooks/use-now';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { DriverTrip } from '../api';
import { useDropDriverTrip } from '../hooks';
import { makeDropTripSchema, type DropTripFormValues } from '../schema';

const EMPTY: DropTripFormValues = { reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE, reason: '' };

/**
 * "Báo sự cố / Rút khỏi chuyến" (ADR 0074) — bản native của web `DropTripDialog`. Chọn nhóm lý do,
 * mô tả, và đọc trước hệ quả theo độ sát giờ nhận (cùng `driverDropPolicy` mà server dùng; server
 * vẫn chốt vùng khi bấm). Đơn của khách KHÔNG bị huỷ — chủ xe được báo khẩn để gán tài xế khác.
 *
 * Nơi gọi mount CÓ ĐIỀU KIỆN: mỗi lần mở là một form mới (lý do chuyến trước không theo sang).
 */
export function DropTripSheet({
  trip,
  onClose,
  onDropped,
}: {
  trip: Pick<DriverTrip, 'id' | 'code' | 'pickupAt' | 'releaseUntil'>;
  onClose: () => void;
  onDropped?: () => void;
}) {
  const t = useTranslations('Driving.drop');
  const tToast = useTranslations('Driving.toast');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const drop = useDropDriverTrip();
  const now = useNow();

  const schema = useMemo(
    () => makeDropTripSchema(t as (key: string, values?: Record<string, number>) => string),
    [t],
  );
  const { control, handleSubmit } = useForm<DropTripFormValues>({
    resolver: yupResolver(schema),
    defaultValues: EMPTY,
  });
  const category = useWatch({ control, name: 'reasonCategory' });

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
          toast.showSuccess(tToast('tripDropped'));
          onClose();
          onDropped?.();
        },
      },
    );
  });

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('title', { code: trip.code })}
      footer={
        <Button
          label={t('confirm')}
          variant="danger"
          loading={drop.isPending}
          onPress={() => void submit()}
        />
      }
    >
      <YStack gap={space.sm}>
        <Callout tone="info" title={t('keepsBooking')} />
        <Callout
          tone={
            policy.zone === DRIVER_DROP_ZONE.CRITICAL
              ? 'danger'
              : cooldownHours > 0
                ? 'warning'
                : 'info'
          }
          title={domainLabel('driverDropZone', policy.zone)}
        >
          {policy.zone === DRIVER_DROP_ZONE.GRACE
            ? t('penalty.grace')
            : policy.zone === DRIVER_DROP_ZONE.FAR
              ? t('penalty.far')
              : t('penalty.cooldown', { hours: cooldownHours })}
        </Callout>
        {drop.isError ? <Callout tone="danger" title={errorMessage(drop.error)} /> : null}
      </YStack>
      <RadioField
        control={control}
        name="reasonCategory"
        label={t('reason')}
        required
        options={DRIVER_DROP_REASON_VALUES.map((value) => ({
          value,
          label: domainLabel('driverDropReason', value),
        }))}
      />
      <TextField
        control={control}
        name="reason"
        label={t('note')}
        placeholder={t('notePlaceholder')}
        multiline
        rows={3}
        maxLength={DRIVER_DROP_NOTE_LENGTH.MAX}
        required={category === DRIVER_DROP_REASON.OTHER}
      />
    </BottomSheet>
  );
}
