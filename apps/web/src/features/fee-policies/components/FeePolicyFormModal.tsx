'use client';

import { App, Alert, Divider } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { DEPOSIT_PERCENT_MAX, DEPOSIT_PERCENT_MIN } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  FEE_POLICY_AMOUNT_MAX,
  FEE_POLICY_VEHICLE_TYPES,
  buildFeePolicySchema,
  feePolicyFormDefaults,
  toUpsertFeePolicyBody,
  type FeePolicyFormValues,
} from '../form';
import { useCreateFeePolicyDraft, useUpdateFeePolicyDraft } from '../hooks/use-fee-policies';
import type { FeePolicy } from '../types';
import { CommissionTiersField } from './CommissionTiersField';
import { TaxRatesField } from './TaxRatesTable';
import styles from './FeePolicyFormModal.module.css';

/**
 * Tạo/sửa BẢN NHÁP chính sách phí — luồng tiền v2 trên nền ADR 0028 điều 2–5, ADR 0029 (R3).
 *
 * Bản đang hiệu lực là BẤT BIẾN (backend chặn PATCH sau khi active), nên modal này chỉ SỬA bản
 * `draft`. Nhân bản (`duplicateFrom`) dựng một bản nháp MỚI mang bộ số của phiên bản nguồn — đường
 * đúng để đổi vài con số của bản đang chạy. Kích hoạt là hành động RIÊNG ở trang danh sách: "sửa
 * số" và "cho số này chạy thật" phải là hai cú bấm khác nhau.
 *
 * Nơi gọi phải đổi `key` theo bản ghi: form giữ state RHF suốt vòng đời, và một modal tái dùng sẽ
 * gửi số của bản A lên bản B.
 */
export function FeePolicyFormModal({
  open,
  policy,
  duplicateFrom = null,
  onClose,
}: {
  open: boolean;
  /** Bản nháp đang sửa; `null` = tạo bản nháp mới. */
  policy: FeePolicy | null;
  /** Tạo mới bằng cách sao bộ số của phiên bản này. Bỏ qua khi `policy` có giá trị. */
  duplicateFrom?: FeePolicy | null;
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
  const source = policy ?? duplicateFrom;
  const pending = create.isPending || update.isPending;

  const schema = useMemo(
    () =>
      buildFeePolicySchema({
        nameRequired: t('form.validation.nameRequired'),
        required: t('form.validation.required'),
        range: t('form.validation.range'),
        nonNegative: t('form.validation.nonNegative'),
        integer: t('form.validation.integer'),
        thousandStep: t('form.validation.thousandStep'),
        ratePositive: t('form.validation.ratePositive'),
        taxRateRequired: t('form.validation.taxRateRequired'),
        taxLegalBasisRequired: t('form.validation.taxLegalBasisRequired'),
        partnerRequired: t('form.validation.partnerRequired'),
        blocker: (code) => domainLabel('feePolicyActivationBlocker', code),
      }),
    [t, domainLabel],
  );

  const defaultValues = useMemo(() => {
    const values = feePolicyFormDefaults(source);
    if (!policy && duplicateFrom) {
      values.name = t('form.duplicateName', { name: duplicateFrom.name });
    }
    return values;
    // Giá trị khởi tạo chỉ đọc một lần — nơi gọi đổi `key` khi đổi bản ghi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { control, handleSubmit } = useForm<FeePolicyFormValues>({
    // `yup.InferType` của schema có `.when` không khớp từng chữ với interface tay; schema vẫn là
    // nguồn kiểm, interface là hình dạng form.
    resolver: yupResolver(schema) as unknown as Resolver<FeePolicyFormValues>,
    defaultValues,
  });

  const taxEnabled = useWatch({ control, name: 'taxEnabled' });
  const tripInsuranceEnabled = useWatch({ control, name: 'tripInsuranceEnabled' });
  const vehicleProtectionEnabled = useWatch({ control, name: 'vehicleProtectionEnabled' });
  const insuranceOn = tripInsuranceEnabled || vehicleProtectionEnabled;

  const onSubmit = handleSubmit((values) => {
    // Enter vẫn gửi form khi nút OK đang quay — chặn lượt gửi thứ hai.
    if (pending) return;
    const body = toUpsertFeePolicyBody(values);
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

  const title = policy
    ? t('form.titleEdit', { version: policy.version })
    : duplicateFrom
      ? t('form.titleDuplicate', { version: duplicateFrom.version })
      : t('form.titleCreate');

  const vehicleLabel = (type: string) => domainLabel('vehicleType', type);

  return (
    <ResponsiveDialog
      title={title}
      open={open}
      onClose={onClose}
      size="lg"
      okText={tCommon('actions.save')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <TextField control={control} name="name" label={t('form.name')} required />
        <TextAreaField control={control} name="note" label={t('form.note')} rows={2} />

        <Divider plain>{t('form.sectionPlatformFee')}</Divider>
        <p className={styles.hint}>{t('form.platformFeeHint')}</p>
        {FEE_POLICY_VEHICLE_TYPES.map((type) => (
          <NumberField
            key={type}
            control={control}
            name={`customerPlatformFee.${type}`}
            label={t('form.platformFeeFor', { type: vehicleLabel(type) })}
            money
            min={0}
            max={FEE_POLICY_AMOUNT_MAX}
            required
          />
        ))}

        <Divider plain>{t('form.sectionCommission')}</Divider>
        {/* Phạm vi đi trước con số: nấc này không chạm tới gian hàng có gói (H = 0 — ADR 0064 điều 3). */}
        <Alert
          type="info"
          showIcon
          title={t('commissionScope.title')}
          description={t('form.commissionHint')}
          className={styles.alert}
        />
        <CommissionTiersField control={control} />

        <Divider plain>{t('form.sectionDeposit')}</Divider>
        <p className={styles.hint}>{t('form.depositHint')}</p>
        <NumberField
          control={control}
          name="depositPercent"
          label={t('form.depositPercent')}
          percent
          min={DEPOSIT_PERCENT_MIN}
          max={DEPOSIT_PERCENT_MAX}
          precision={0}
          required
        />
        <NumberField
          control={control}
          name="depositMinAmount"
          label={t('form.depositMinAmount')}
          money
          min={0}
          max={FEE_POLICY_AMOUNT_MAX}
          required
        />
        <NumberField
          control={control}
          name="depositMaxPercent"
          label={t('form.depositMaxPercent')}
          percent
          min={DEPOSIT_PERCENT_MIN}
          max={DEPOSIT_PERCENT_MAX}
          precision={0}
          required
        />
        <NumberField
          control={control}
          name="holdMinAmount"
          label={t('form.holdMinAmount')}
          money
          min={0}
          max={FEE_POLICY_AMOUNT_MAX}
          required
        />
        <NumberField
          control={control}
          name="holdPaymentWindowMinutes"
          label={t('form.holdPaymentWindowMinutes')}
          min={0}
          precision={0}
          addonAfter={t('form.minutesUnit')}
          required
        />
        <NumberField
          control={control}
          name="freeCancelHours"
          label={t('form.freeCancelHours')}
          min={0}
          precision={0}
          addonAfter={t('form.hoursUnit')}
          required
        />

        <Divider plain>{t('form.sectionInsurance')}</Divider>
        <Alert type="info" showIcon title={t('form.insuranceHint')} className={styles.alert} />
        <SwitchField
          control={control}
          name="vehicleProtectionEnabled"
          label={t('form.vehicleProtectionEnabled')}
          description={t('form.insuranceProductHint')}
        />
        {vehicleProtectionEnabled
          ? FEE_POLICY_VEHICLE_TYPES.map((type) => (
              <NumberField
                key={type}
                control={control}
                name={`vehicleProtectionDailyAmount.${type}`}
                label={t('form.dailyRateFor', { type: vehicleLabel(type) })}
                money
                min={0}
                max={FEE_POLICY_AMOUNT_MAX}
                required
              />
            ))
          : null}
        <SwitchField
          control={control}
          name="tripInsuranceEnabled"
          label={t('form.tripInsuranceEnabled')}
          description={t('form.insuranceProductHint')}
        />
        {tripInsuranceEnabled
          ? FEE_POLICY_VEHICLE_TYPES.map((type) => (
              <NumberField
                key={type}
                control={control}
                name={`tripInsuranceDailyAmount.${type}`}
                label={t('form.dailyRateFor', { type: vehicleLabel(type) })}
                money
                min={0}
                max={FEE_POLICY_AMOUNT_MAX}
                required
              />
            ))
          : null}
        {insuranceOn ? (
          <TextField
            control={control}
            name="insurancePartnerName"
            label={t('form.insurancePartnerName')}
            help={t('form.insurancePartnerNameHint')}
            required
          />
        ) : null}

        <Divider plain>{t('form.sectionTax')}</Divider>
        <SwitchField
          control={control}
          name="taxEnabled"
          label={t('form.taxEnabled')}
          description={t('form.taxEnabledHint')}
        />
        {taxEnabled ? (
          <>
            <TextField
              control={control}
              name="taxLegalBasis"
              label={t('form.taxLegalBasis')}
              help={t('form.taxLegalBasisHint')}
              required
            />
            <p className={styles.hint}>{t('form.taxRatesTitle')}</p>
            <TaxRatesField control={control} />
            <p className={styles.hint}>{t('form.taxScope')}</p>
          </>
        ) : null}

        {policy && policy.activationBlockers.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            className={styles.alert}
            title={t('form.activationBlocked')}
            description={policy.activationBlockers
              .map((code) => domainLabel('feePolicyActivationBlocker', code))
              .join(' · ')}
          />
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
