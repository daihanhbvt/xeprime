'use client';

import { App, Alert } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { BOOKING_HOLD_OUTCOME_VALUES } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useSettleHold } from '../hooks/use-platform-money';
import type { PlatformHold } from '../types';

/**
 * Chốt TAY kết cục một khoản giữ chỗ — thường sau khi một tranh chấp đã có kết luận.
 *
 * Lý do BẮT BUỘC: đây là quyết định về tiền của người khác, và mỗi lần chốt tay là một dòng
 * `audit_logs` phải truy được về một con người. Kết luận tranh chấp (bước phán xét) nằm ở màn
 * support — màn này chỉ thực hiện phần kế toán.
 */
export function SettleHoldModal({ hold, onClose }: { hold: PlatformHold | null; onClose: () => void }) {
  const t = useTranslations('PlatformMoney');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const settle = useSettleHold();

  const schema = useMemo(
    () =>
      yup.object({
        outcome: yup.string().oneOf(BOOKING_HOLD_OUTCOME_VALUES).required(),
        note: yup.string().trim().min(5, t('settle.noteRequired')).max(1000).required(t('settle.noteRequired')),
      }),
    [t],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { outcome: BOOKING_HOLD_OUTCOME_VALUES[0], note: '' },
  });

  const onSubmit = handleSubmit((values) => {
    if (!hold) return;
    settle.mutate(
      { id: hold.id, outcome: values.outcome, note: values.note.trim() },
      {
        onSuccess: () => {
          message.success(t('settle.success'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('settle.title', { code: hold?.code ?? '' })}
      open={Boolean(hold)}
      onClose={onClose}
      okText={t('settle.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={settle.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        {hold?.disputeOpen ? (
          <Alert type="warning" showIcon message={t('settle.disputeOpen')} />
        ) : null}
        <RadioGroupField
          control={control}
          name="outcome"
          label={t('settle.outcome')}
          vertical
          options={BOOKING_HOLD_OUTCOME_VALUES.map((value) => ({
            value,
            label: domainLabel('bookingHoldOutcome', value),
          }))}
        />
        <TextAreaField control={control} name="note" label={t('settle.note')} rows={3} />
        <Alert type="info" showIcon message={t('settle.auditHint')} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
