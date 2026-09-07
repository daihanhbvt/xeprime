'use client';

import { App, Alert, Descriptions } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { DialogForm } from '@/components/form/DialogForm';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useMarkRefundPaid } from '../hooks/use-platform-money';
import type { PlatformHoldRefund } from '../types';

/**
 * Ghi nhận ĐÃ CHUYỂN TRẢ một khoản hoàn — ADR 0028 điều 6/8 (R3).
 *
 * Chuyển tiền diễn ra ở ngân hàng, ngoài hệ thống; màn này chỉ ghi BẰNG CHỨNG. Mã giao dịch là
 * bắt buộc vì đó là thứ duy nhất đối chiếu được chiều tiền RA — không có nó thì "đã hoàn" chỉ là
 * lời khai.
 */
export function RefundPaidModal({
  refund,
  onClose,
}: {
  refund: PlatformHoldRefund | null;
  onClose: () => void;
}) {
  const t = useTranslations('PlatformMoney');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const markPaid = useMarkRefundPaid();

  const schema = useMemo(
    () =>
      yup.object({
        bankReference: yup
          .string()
          .trim()
          .min(3, t('refundPaid.referenceRequired'))
          .max(100)
          .required(t('refundPaid.referenceRequired')),
        note: yup.string().trim().max(1000).default(''),
      }),
    [t],
  );

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { bankReference: '', note: '' },
  });

  const onSubmit = handleSubmit((values) => {
    if (!refund) return;
    markPaid.mutate(
      { id: refund.id, bankReference: values.bankReference.trim(), note: values.note?.trim() || null },
      {
        onSuccess: () => {
          message.success(t('refundPaid.success'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const hasAccount = Boolean(refund?.bankCode && refund?.bankAccountNumber);

  return (
    <ResponsiveDialog
      title={t('refundPaid.title')}
      open={Boolean(refund)}
      onClose={onClose}
      okText={t('refundPaid.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={markPaid.isPending}
    >
      {refund ? (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label={t('columns.amount')}>{fmt.money(refund.amount)}</Descriptions.Item>
          <Descriptions.Item label={t('columns.customer')}>{refund.customerName}</Descriptions.Item>
          <Descriptions.Item label={t('refundPaid.account')}>
            {hasAccount
              ? `${refund.bankCode} · ${refund.bankAccountNumber} · ${refund.bankAccountName ?? ''}`
              : tCommon('labels.emptyValue')}
          </Descriptions.Item>
        </Descriptions>
      ) : null}

      {!hasAccount ? (
        <Alert type="warning" showIcon message={t('refundPaid.noAccount')} />
      ) : null}

      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField control={control} name="bankReference" label={t('refundPaid.bankReference')} />
        <TextAreaField control={control} name="note" label={t('refundPaid.note')} rows={2} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
