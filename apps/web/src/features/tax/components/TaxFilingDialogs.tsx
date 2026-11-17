'use client';

import { Alert, App, Descriptions } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useCallback, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { taxPeriodFilingEarliestDateKey } from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { DAY_PARAM_FORMAT, nowInAppTz } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useMarkPeriodDeclared, useMarkPeriodRemitted } from '../hooks/use-tax';
import type { TaxPeriodSummary } from '../types';
import styles from './TaxFilingDialogs.module.css';

/** Cùng sàn/trần với `DeclareTaxPeriodDto` / `RemitTaxPeriodDto`. */
const REF_MIN = 3;
const REF_MAX = 120;
const NOTE_MAX = 1000;

/** Hôm nay theo giờ Việt Nam, `YYYY-MM-DD` — trần của ngày trên chứng từ. */
function todayKey(): string {
  return nowInAppTz().format(DAY_PARAM_FORMAT);
}

/**
 * Ngày trên chứng từ: từ ngày đầu tháng sau kỳ tới hôm nay — cùng luật với server
 * (`taxPeriodFilingEarliestDateKey`). Server kiểm lại; ở đây chỉ để báo lỗi ngay trên ô.
 */
function filingDateSchema(period: string, required: string, range: string) {
  const earliest = taxPeriodFilingEarliestDateKey(period);
  return yup
    .string()
    .nullable()
    .required(required)
    .test('range', range, (value) => !value || (value >= earliest && value <= todayKey()));
}

/** Ngày mặc định của ô ngày: hôm nay, nhưng không trước ngày sớm nhất hợp lệ. */
function defaultFilingDate(period: string): string {
  const earliest = taxPeriodFilingEarliestDateKey(period);
  const today = todayKey();
  return today < earliest ? earliest : today;
}

interface DialogProps {
  period: string;
  summary: TaxPeriodSummary;
  open: boolean;
  onClose: () => void;
}

/**
 * Ghi KÊ KHAI cả kỳ — số tờ khai + ngày nộp tờ khai là bắt buộc (chứng cứ để đối chiếu sổ với cơ
 * quan thuế). Form reset mỗi lần mở (kể cả sau Huỷ): hộp sống suốt đời màn, không reset là kỳ B
 * mở ra với số tờ khai của kỳ A.
 */
export function DeclarePeriodDialog({ period, summary, open, onClose }: DialogProps) {
  const t = useTranslations('PlatformMoney.tax');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const declare = useMarkPeriodDeclared();
  const earliest = taxPeriodFilingEarliestDateKey(period);

  const schema = useMemo(
    () =>
      yup.object({
        declarationRef: yup
          .string()
          .trim()
          .min(REF_MIN, t('declareDialog.refRequired'))
          .max(REF_MAX, tCommon('validation.maxLength', { max: REF_MAX }))
          .required(t('declareDialog.refRequired')),
        declaredOn: filingDateSchema(
          period,
          t('declareDialog.dateRequired'),
          t('declareDialog.dateRange', { from: fmt.dateKey(earliest) }),
        ),
      }),
    [t, tCommon, fmt, period, earliest],
  );
  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { declarationRef: '', declaredOn: defaultFilingDate(period) },
  });

  useEffect(() => {
    if (open) reset({ declarationRef: '', declaredOn: defaultFilingDate(period) });
  }, [open, period, reset]);

  const onSubmit = handleSubmit((values) => {
    // Enter trong ô nhập gửi form kể cả khi nút đang quay — chặn lượt thứ hai ở đây.
    if (declare.isPending || !values.declaredOn) return;
    declare.mutate(
      {
        period,
        body: { declarationRef: values.declarationRef.trim(), declaredOn: values.declaredOn },
      },
      {
        onSuccess: () => {
          message.success(t('actions.declaredDone'));
          onClose();
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('declareDialog.title', { period })}
      open={open}
      onClose={onClose}
      okText={t('declareDialog.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={declare.isPending}
      size="sm"
    >
      <p className={styles.hint}>{t('declareDialog.hint')}</p>
      <Descriptions size="small" column={1} className={styles.info}>
        <Descriptions.Item label={t('declareDialog.rows')}>{summary.accruedRows}</Descriptions.Item>
        <Descriptions.Item label={t('declareDialog.amount')}>
          {fmt.money(summary.accruedAmount)}
        </Descriptions.Item>
      </Descriptions>
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField
          control={control}
          name="declarationRef"
          label={t('declareDialog.ref')}
          help={t('declareDialog.refHint')}
          required
        />
        <DateTimeField
          control={control}
          name="declaredOn"
          label={t('declareDialog.date')}
          dateOnly
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}

/**
 * Ghi NỘP thuế cả kỳ — mã chứng từ, ngày nộp, số đã nộp. Số đã nộp được phép lệch tổng trên sổ
 * (người dùng chốt 16/11/2026) nhưng khi lệch thì ghi chú là bắt buộc; server kiểm lại cùng luật.
 *
 * Tổng trên sổ = phần đã kê khai sắp ghi nộp + phần đã nộp từ trước (kỳ cũ ghi chứng cứ bổ sung) —
 * đúng con số server chụp vào `ledger_amount`.
 */
export function RemitPeriodDialog({ period, summary, open, onClose }: DialogProps) {
  const t = useTranslations('PlatformMoney.tax');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const remit = useMarkPeriodRemitted();
  const earliest = taxPeriodFilingEarliestDateKey(period);
  const ledger = Number(summary.declaredAmount) + Number(summary.remittedAmount);

  const schema = useMemo(
    () =>
      yup.object({
        remittanceRef: yup
          .string()
          .trim()
          .min(REF_MIN, t('remitDialog.refRequired'))
          .max(REF_MAX, tCommon('validation.maxLength', { max: REF_MAX }))
          .required(t('remitDialog.refRequired')),
        remittedOn: filingDateSchema(
          period,
          t('remitDialog.dateRequired'),
          t('declareDialog.dateRange', { from: fmt.dateKey(earliest) }),
        ),
        remittedAmount: yup
          .number()
          .nullable()
          .required(t('remitDialog.amountRequired'))
          .integer(t('remitDialog.amountRequired'))
          .min(1, t('remitDialog.amountRequired')),
        note: yup
          .string()
          .trim()
          .max(NOTE_MAX, tCommon('validation.maxLength', { max: NOTE_MAX }))
          .default('')
          .when('remittedAmount', {
            is: (amount: number | null) => amount !== null && amount !== ledger,
            then: (s) => s.required(t('remitDialog.noteRequired')),
          }),
      }),
    [t, tCommon, fmt, period, earliest, ledger],
  );
  type FormValues = yup.InferType<typeof schema>;

  const defaults = useCallback(
    (): FormValues => ({
      remittanceRef: '',
      remittedOn: defaultFilingDate(period),
      // Số mặc định = tổng trên sổ: ca thường là nộp đúng sổ, người trực chỉ sửa khi chứng từ lệch.
      remittedAmount: ledger,
      note: '',
    }),
    [period, ledger],
  );
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) reset(defaults());
  }, [open, defaults, reset]);

  const amount = useWatch({ control, name: 'remittedAmount' });
  const mismatch = amount !== null && amount !== undefined && amount !== ledger;

  const onSubmit = handleSubmit((values) => {
    if (remit.isPending || !values.remittedOn || values.remittedAmount === null) return;
    remit.mutate(
      {
        period,
        body: {
          remittanceRef: values.remittanceRef.trim(),
          remittedOn: values.remittedOn,
          remittedAmount: String(values.remittedAmount),
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          message.success(t('actions.remittedDone'));
          onClose();
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('remitDialog.title', { period })}
      open={open}
      onClose={onClose}
      okText={t('remitDialog.submit')}
      onOk={() => void onSubmit()}
      confirmLoading={remit.isPending}
      size="sm"
    >
      <p className={styles.hint}>{t('remitDialog.hint')}</p>
      <Descriptions size="small" column={1} className={styles.info}>
        <Descriptions.Item label={t('remitDialog.rows')}>{summary.declaredRows}</Descriptions.Item>
        <Descriptions.Item label={t('remitDialog.ledger')}>
          {fmt.money(String(ledger))}
        </Descriptions.Item>
      </Descriptions>
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField control={control} name="remittanceRef" label={t('remitDialog.ref')} required />
        <DateTimeField control={control} name="remittedOn" label={t('remitDialog.date')} dateOnly />
        <NumberField
          control={control}
          name="remittedAmount"
          label={t('remitDialog.amount')}
          money
          min={0}
          required
        />
        {mismatch ? (
          <Alert
            type="warning"
            showIcon
            className={styles.info}
            title={t('remitDialog.mismatch', { ledger: fmt.money(String(ledger)) })}
          />
        ) : null}
        <TextAreaField
          control={control}
          name="note"
          label={t('remitDialog.note')}
          rows={3}
          maxLength={NOTE_MAX}
          required={mismatch}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
