'use client';

import { Alert, App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { PAYMENT_KIND, type PaymentKind } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { TextField } from '@/components/form/TextField';
import { PAYMENT_METHOD_OPTIONS } from '@/features/finance/constants';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useRecordPayment } from '../hooks/use-payments';
import { recordPaymentSchema, type RecordPaymentValues } from '../schema';
import type { RecordPaymentInput } from '../types';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './RecordPaymentModal.module.css';

const DEFAULTS: RecordPaymentValues = {
  amount: null,
  method: 'cash',
  referenceCode: '',
  description: '',
};

function defaultsForAmount(suggested: string): RecordPaymentValues {
  const value = Number(suggested);
  return {
    ...DEFAULTS,
    amount: Number.isFinite(value) && value > 0 ? value : null,
  };
}

interface RecordPaymentModalProps {
  bookingId: string;
  /**
   * Số gợi ý sẵn: công nợ còn lại (tiền thuê) hoặc phần cọc chưa thu — nơi gọi tự quyết vì chỉ
   * nó biết đang đứng ở khối nào.
   */
  debtAmount: string;
  open: boolean;
  onClose: () => void;
  /**
   * Tiền THUÊ hay tiền CỌC. Mặc định tiền thuê để mọi lời gọi cũ giữ nguyên hành vi.
   *
   * Đây không phải một nhãn: cọc **không** cộng vào `paidAmount` và **không** làm giảm công nợ
   * (nó là tài sản giữ hộ, sẽ trả lại khách). Chọn nhầm là ghi sai sổ ở hai chỗ cùng lúc.
   */
  kind?: PaymentKind;
}

/** Modal ghi nhận một lần thu tiền cho đơn — tiền thuê hoặc tiền cọc. */
export function RecordPaymentModal({
  bookingId,
  debtAmount,
  open,
  onClose,
  kind = PAYMENT_KIND.RENTAL,
}: RecordPaymentModalProps) {
  const fmt = useAppFormat();
  const isDeposit = kind === PAYMENT_KIND.DEPOSIT;

  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { control, handleSubmit, reset } = useForm<RecordPaymentValues>({
    resolver: yupResolver(recordPaymentSchema),
    defaultValues: defaultsForAmount(debtAmount),
  });
  const record = useRecordPayment(bookingId);

  // Mỗi lần mở (hoặc chuyển sang đơn khác) điền đúng số mới nhất, không giữ số đã gõ ở lần trước.
  useEffect(() => {
    if (open) reset(defaultsForAmount(debtAmount));
  }, [debtAmount, open, reset]);

  const submit = handleSubmit((values) => {
    const body: RecordPaymentInput = {
      amount: String(values.amount ?? 0),
      method: values.method,
      kind,
      referenceCode: values.referenceCode || undefined,
      description: values.description || undefined,
    };
    record.mutate(body, {
      onSuccess: () => {
        message.success(isDeposit ? 'Đã ghi nhận thu cọc' : 'Đã ghi nhận thu tiền');
        reset(DEFAULTS);
        onClose();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  });

  return (
    <ResponsiveDialog
      title={isDeposit ? 'Thu tiền cọc' : 'Thu tiền đơn'}
      open={open}
      onClose={onClose}
      size="sm"
      okText="Ghi nhận"
      onOk={() => void submit()}
      confirmLoading={record.isPending}
    >
      <p className={styles.lead}>
        {isDeposit ? 'Cọc còn phải thu' : 'Còn nợ'}: <b>{fmt.money(debtAmount)}</b>
      </p>
      {isDeposit ? (
        // Nói TRƯỚC khi ghi, không phải sau: chủ xe nhìn công nợ không đổi sau khi thu 5 triệu
        // sẽ tưởng hệ thống nuốt mất tiền.
        <Alert
          className={styles.note}
          type="info"
          showIcon
          message="Cọc không trừ vào công nợ"
          description="Tiền cọc là tài sản giữ hộ khách, sẽ hoàn lại khi kết thúc chuyến — nên nó lên sổ Thu-Chi nhưng không làm giảm số tiền thuê khách còn nợ."
        />
      ) : null}
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
