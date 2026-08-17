'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { DialogForm } from '@/components/form/DialogForm';
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

function defaultsForDebt(debtAmount: string): RecordPaymentValues {
  const debt = Number(debtAmount);
  return {
    ...DEFAULTS,
    amount: Number.isFinite(debt) && debt > 0 ? debt : null,
  };
}

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
    defaultValues: defaultsForDebt(debtAmount),
  });
  const record = useRecordPayment(bookingId);

  // Mỗi lần mở (hoặc chuyển sang đơn khác) điền đúng số CÒN NỢ mới nhất, không giữ số đã gõ ở lần trước.
  useEffect(() => {
    if (open) reset(defaultsForDebt(debtAmount));
  }, [debtAmount, open, reset]);

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
    <ResponsiveDialog
      title="Thu tiền đơn"
      open={open}
      onClose={onClose}
      size="sm"
      okText="Ghi nhận"
      onOk={() => void submit()}
      confirmLoading={record.isPending}
    >
      <p style={{ marginBottom: 16 }}>
        Còn nợ: <b>{formatMoneyVnd(debtAmount)}</b>
      </p>
      <DialogForm onSubmit={submit} labelWidth="md">
        <NumberField control={control} name="amount" label="Số tiền nhận" money min={0} />
        <SelectField control={control} name="method" label="Hình thức" options={PAYMENT_METHOD_OPTIONS} />
        <TextField
          control={control}
          name="referenceCode"
          label="Mã tra soát (tuỳ chọn)"
          placeholder="VD: mã giao dịch CK"
        />
        <TextField control={control} name="description" label="Ghi chú (tuỳ chọn)" />
      </DialogForm>
    </ResponsiveDialog>
  );
}
