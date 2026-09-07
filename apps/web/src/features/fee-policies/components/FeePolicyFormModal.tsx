'use client';

import { App, Alert, Divider } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { SERVICE_FEE_PERCENT_MAX, SERVICE_FEE_PERCENT_MIN } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreateFeePolicyDraft, useUpdateFeePolicyDraft } from '../hooks/use-fee-policies';
import type { FeePolicy, UpsertFeePolicyInput } from '../types';

/**
 * Tạo/sửa BẢN NHÁP chính sách phí — ADR 0028 điều 2–5, ADR 0029 (R3).
 *
 * Bản đang hiệu lực là BẤT BIẾN (backend chặn PATCH sau khi active), nên modal này chỉ dùng cho
 * `status = draft`. Kích hoạt là hành động RIÊNG (nút ở trang danh sách), không nằm trong form —
 * hai việc "sửa số" và "cho số này chạy thật" phải là hai cú bấm khác nhau.
 */
export function FeePolicyFormModal({
  open,
  policy,
  onClose,
}: {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa bản nháp đó. */
  policy: FeePolicy | null;
  onClose: () => void;
}) {
  const t = useTranslations('FeePolicies');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreateFeePolicyDraft();
  const update = useUpdateFeePolicyDraft();
  const isEdit = Boolean(policy);
  const pending = create.isPending || update.isPending;

  const schema = useMemo(() => {
    return yup.object({
      name: yup.string().trim().required(t('form.validation.nameRequired')).max(120),
      note: yup.string().trim().max(2000).default(''),
      serviceFeePercent: yup
        .number()
        .required()
        .min(SERVICE_FEE_PERCENT_MIN, t('form.validation.range'))
        .max(SERVICE_FEE_PERCENT_MAX, t('form.validation.range')),
      holdMinAmount: yup.number().required().min(0, t('form.validation.nonNegative')),
      holdPaymentWindowMinutes: yup
        .number()
        .required()
        .integer(t('form.validation.integer'))
        .min(5)
        .max(7 * 24 * 60),
      freeCancelHours: yup
        .number()
        .required()
        .integer(t('form.validation.integer'))
        .min(0)
        .max(24 * 30),
      taxEnabled: yup.boolean().required(),
      taxPercent: yup
        .number()
        .nullable()
        .defined()
        .min(0)
        .max(50)
        .when('taxEnabled', {
          is: true,
          then: (s) => s.test('required', t('form.validation.taxPercentRequired'), (v) => v != null),
        }),
      taxLabel: yup
        .string()
        .trim()
        .max(120)
        .default('')
        .when('taxEnabled', {
          is: true,
          then: (s) => s.test('required', t('form.validation.taxLabelRequired'), (v) => Boolean(v)),
        }),
      tripInsuranceEnabled: yup.boolean().required(),
      tripInsurancePercent: yup
        .number()
        .nullable()
        .defined()
        .min(0)
        .max(50)
        .when('tripInsuranceEnabled', {
          is: true,
          then: (s) =>
            s.test('required', t('form.validation.percentRequired'), (v) => v != null),
        }),
      vehicleProtectionEnabled: yup.boolean().required(),
      vehicleProtectionPercent: yup
        .number()
        .nullable()
        .defined()
        .min(0)
        .max(50)
        .when('vehicleProtectionEnabled', {
          is: true,
          then: (s) =>
            s.test('required', t('form.validation.percentRequired'), (v) => v != null),
        }),
      insurancePartnerName: yup
        .string()
        .trim()
        .max(120)
        .default('')
        .when(['tripInsuranceEnabled', 'vehicleProtectionEnabled'], {
          is: (a: boolean, b: boolean) => a || b,
          then: (s) =>
            s.test('required', t('form.validation.partnerRequired'), (v) => Boolean(v)),
        }),
    });
  }, [t]);

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: policy
      ? {
          name: policy.name,
          note: policy.note ?? '',
          serviceFeePercent: policy.serviceFeePercent,
          holdMinAmount: Number(policy.holdMinAmount),
          holdPaymentWindowMinutes: policy.holdPaymentWindowMinutes,
          freeCancelHours: policy.freeCancelHours,
          taxEnabled: policy.taxEnabled,
          taxPercent: policy.taxPercent,
          taxLabel: policy.taxLabel ?? '',
          tripInsuranceEnabled: policy.tripInsuranceEnabled,
          tripInsurancePercent: policy.tripInsurancePercent,
          vehicleProtectionEnabled: policy.vehicleProtectionEnabled,
          vehicleProtectionPercent: policy.vehicleProtectionPercent,
          insurancePartnerName: policy.insurancePartnerName ?? '',
        }
      : {
          name: '',
          note: '',
          serviceFeePercent: 10,
          holdMinAmount: 20_000,
          holdPaymentWindowMinutes: 24 * 60,
          freeCancelHours: 4,
          taxEnabled: false,
          taxPercent: null,
          taxLabel: '',
          tripInsuranceEnabled: false,
          tripInsurancePercent: null,
          vehicleProtectionEnabled: false,
          vehicleProtectionPercent: null,
          insurancePartnerName: '',
        },
  });

  const taxEnabled = watch('taxEnabled');
  const tripInsuranceEnabled = watch('tripInsuranceEnabled');
  const vehicleProtectionEnabled = watch('vehicleProtectionEnabled');
  const insuranceOn = tripInsuranceEnabled || vehicleProtectionEnabled;

  const onSubmit = handleSubmit((values) => {
    const body: UpsertFeePolicyInput = {
      name: values.name.trim(),
      note: values.note?.trim() || null,
      serviceFeePercent: values.serviceFeePercent,
      holdMinAmount: String(values.holdMinAmount),
      holdPaymentWindowMinutes: values.holdPaymentWindowMinutes,
      freeCancelHours: values.freeCancelHours,
      taxEnabled: values.taxEnabled,
      taxPercent: values.taxEnabled ? values.taxPercent : null,
      taxLabel: values.taxEnabled ? values.taxLabel?.trim() || null : null,
      tripInsuranceEnabled: values.tripInsuranceEnabled,
      tripInsurancePercent: values.tripInsuranceEnabled ? values.tripInsurancePercent : null,
      vehicleProtectionEnabled: values.vehicleProtectionEnabled,
      vehicleProtectionPercent: values.vehicleProtectionEnabled ? values.vehicleProtectionPercent : null,
      insurancePartnerName: insuranceOn ? values.insurancePartnerName?.trim() || null : null,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('form.updatedSuccess') : t('form.createdSuccess'));
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (policy) update.mutate({ id: policy.id, ...body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? t('form.titleEdit', { version: policy?.version ?? 0 }) : t('form.titleCreate')}
      open={open}
      onClose={onClose}
      okText={tCommon('actions.save')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField control={control} name="name" label={t('form.name')} />
        <TextAreaField control={control} name="note" label={t('form.note')} rows={2} />

        <Divider plain>{t('form.sectionService')}</Divider>
        <NumberField
          control={control}
          name="serviceFeePercent"
          label={t('form.serviceFeePercent')}
          percent
          min={SERVICE_FEE_PERCENT_MIN}
          max={SERVICE_FEE_PERCENT_MAX}
          precision={2}
        />
        <NumberField
          control={control}
          name="holdMinAmount"
          label={t('form.holdMinAmount')}
          money
          min={0}
        />
        <NumberField
          control={control}
          name="holdPaymentWindowMinutes"
          label={t('form.holdPaymentWindowMinutes')}
          min={5}
          addonAfter={t('form.minutesUnit')}
        />
        <NumberField
          control={control}
          name="freeCancelHours"
          label={t('form.freeCancelHours')}
          min={0}
          addonAfter={t('form.hoursUnit')}
        />

        <Divider plain>{t('form.sectionTax')}</Divider>
        <SwitchField control={control} name="taxEnabled" label={t('form.taxEnabled')} description={t('form.taxEnabledHint')} />
        {taxEnabled ? (
          <>
            <NumberField control={control} name="taxPercent" label={t('form.taxPercent')} percent min={0} max={50} precision={2} />
            <TextField control={control} name="taxLabel" label={t('form.taxLabel')} />
          </>
        ) : null}

        <Divider plain>{t('form.sectionInsurance')}</Divider>
        <Alert type="info" showIcon message={t('form.insuranceHint')} />
        <SwitchField
          control={control}
          name="tripInsuranceEnabled"
          label={t('form.tripInsuranceEnabled')}
        />
        {tripInsuranceEnabled ? (
          <NumberField
            control={control}
            name="tripInsurancePercent"
            label={t('form.tripInsurancePercent')}
            percent
            min={0}
            max={50}
            precision={2}
          />
        ) : null}
        <SwitchField
          control={control}
          name="vehicleProtectionEnabled"
          label={t('form.vehicleProtectionEnabled')}
        />
        {vehicleProtectionEnabled ? (
          <NumberField
            control={control}
            name="vehicleProtectionPercent"
            label={t('form.vehicleProtectionPercent')}
            percent
            min={0}
            max={50}
            precision={2}
          />
        ) : null}
        {insuranceOn ? (
          <TextField
            control={control}
            name="insurancePartnerName"
            label={t('form.insurancePartnerName')}
            help={t('form.insurancePartnerNameHint')}
          />
        ) : null}

        {policy && policy.activationBlockers.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message={t('form.activationBlocked')}
            description={policy.activationBlockers
              .map((code) => domainLabel('feePolicyActivationBlocker', code))
              .join(' · ')}
          />
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
