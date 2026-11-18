'use client';

import { Alert, App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { PAYMENT_KIND, type PaymentKind } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { TextField } from '@/components/form/TextField';
import { useFinanceOptions } from '@/features/finance/hooks/use-finance-options';
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
  /**
   * `debtAmount` là phần khách còn đưa TẬN TAY (`counterDueAmount` = công nợ − `D` đã nằm ở XePrime)
   * chứ không phải cả công nợ. Chỉ đổi nhãn dòng dẫn cho khớp khung "Còn phải thu của khách" của
   * trang đơn; số gợi ý vẫn là `debtAmount`.
   */
  counterDue?: boolean;
}

/** Modal ghi nhận một lần thu tiền cho đơn — tiền thuê hoặc tiền cọc. */
export function RecordPaymentModal({
  bookingId,
  debtAmount,
  open,
  onClose,
  kind = PAYMENT_KIND.RENTAL,
  counterDue = false,
}: RecordPaymentModalProps) {
  const t = useTranslations('Bookings.payments');
  const fmt = useAppFormat();
  const isDeposit = kind === PAYMENT_KIND.DEPOSIT;

  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const financeOptions = useFinanceOptions();
  /*
   * Tiền THUÊ không thu quá số còn phải thu — server chặn y hệt (`PAYMENT_EXCEEDS_DUE`). Ô số tiền
   * vẫn sửa được để thu TỪNG PHẦN; khách đưa dư ngoài đơn thì lập phiếu ở Sổ Thu-Chi. Cọc là tiền
   * giữ hộ, không có trần ở đây.
   */
  const schema = useMemo(() => {
    const cap = Number(debtAmount);
    return recordPaymentSchema(
      t,
      isDeposit || !Number.isFinite(cap) ? null : { amount: cap, label: fmt.money(debtAmount) },
    );
  }, [debtAmount, fmt, isDeposit, t]);
  const { control, handleSubmit, reset } = useForm<RecordPaymentValues>({
    resolver: yupResolver(schema),
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
        message.success(isDeposit ? t('recordDepositSuccess') : t('recordSuccess'));
        reset(DEFAULTS);
        onClose();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  });

  return (
    <ResponsiveDialog
      title={isDeposit ? t('recordDepositTitle') : t('recordTitle')}
      open={open}
      onClose={onClose}
      size="sm"
      okText={t('recordOk')}
      onOk={() => void submit()}
      confirmLoading={record.isPending}
    >
      <p className={styles.lead}>
        {isDeposit ? t('depositLead') : counterDue ? t('counterLead') : t('debtLead')}:{' '}
        <b>{fmt.money(debtAmount)}</b>
      </p>
      {isDeposit ? (
        // Nói TRƯỚC khi ghi, không phải sau: chủ xe nhìn công nợ không đổi sau khi thu 5 triệu
        // sẽ tưởng hệ thống nuốt mất tiền.
        <Alert
          className={styles.note}
          type="info"
          showIcon
          title={t('depositNoticeTitle')}
          description={t('depositNoticeBody')}
        />
      ) : null}
      <DialogForm onSubmit={submit} labelWidth="md">
        {/* Không đặt `max` cho ô: AntD kẹp số âm thầm, người dùng không biết khoản dư đi đâu. */}
        <NumberField control={control} name="amount" label={t('amountLabel')} money min={0} />
        <SelectField
          control={control}
          name="method"
          label={t('methodLabel')}
          options={financeOptions.paymentMethod}
        />
        <TextField
          control={control}
          name="referenceCode"
          label={t('referenceLabel')}
          placeholder={t('referencePlaceholder')}
        />
        <TextField control={control} name="description" label={t('descriptionLabel')} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
