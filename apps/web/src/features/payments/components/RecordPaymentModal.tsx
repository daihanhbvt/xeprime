'use client';

import { App, Button } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { TextField } from '@/components/form/TextField';
import { PAYMENT_METHOD_OPTIONS } from '@/features/finance/constants';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useRecordPayment } from '../hooks/use-payments';
import { recordPaymentSchema, type RecordPaymentValues } from '../schema';
import type { RecordPaymentInput } from '../types';

const DEFAULTS: RecordPaymentValues = {
  amount: null,
  method: 'cash',
  referenceCode: '',
  description: '',
};

/** Modal ghi nhận một lần thu tiền cho đơn. `debt` để gợi ý số còn nợ. */
export function RecordPaymentModal({
  bookingId,
  debtAmount,
  open,
  onClose,
}: {
  bookingId: string;
  debtAmount: string;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<RecordPaymentValues>({
    resolver: yupResolver(recordPaymentSchema),
    defaultValues: DEFAULTS,
  });
  const record = useRecordPayment(bookingId);

  const submit = handleSubmit((values) => {
    const body: RecordPaymentInput = {
      amount: String(values.amount ?? 0),
      method: values.method,
      referenceCode: values.referenceCode || undefined,
      description: values.description || undefined,
    };
    record.mutate(body, {
      onSuccess: () => {
        message.success('Đã ghi nhận thu tiền');
        reset(DEFAULTS);
        onClose();
      },
      onError: (err) => message.error(getErrorMessage(err)),
    });
  });

  return (
    <ResponsiveDialog title="Thu tiền đơn" open={open} onClose={onClose} footer={null}>
      <p style={{ marginBottom: 16 }}>
        Còn nợ: <b>{formatMoneyVnd(debtAmount)}</b>
      </p>
      <form onSubmit={submit} noValidate>
        <NumberField control={control} name="amount" label="Số tiền nhận" money min={0} />
        <SelectField control={control} name="method" label="Hình thức" options={PAYMENT_METHOD_OPTIONS} />
        <TextField
          control={control}
          name="referenceCode"
          label="Mã tra soát (tuỳ chọn)"
          placeholder="VD: mã giao dịch CK"
        />
        <TextField control={control} name="description" label="Ghi chú (tuỳ chọn)" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" htmlType="submit" loading={record.isPending}>
            Ghi nhận
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
