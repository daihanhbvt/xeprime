'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { TENANT_CUSTOMER_RISK_LEVEL, type TenantCustomerRiskLevel } from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { RISK_LEVEL_VALUES } from '../constants';
import { useUpdateCustomerRisk } from '../hooks/use-customers';
import { customerRiskSchema, type CustomerRiskFormValues } from '../schema';
import type { TenantCustomerDetail } from '../types';
import styles from './CustomerRiskModal.module.css';

/**
 * Đổi mức rủi ro của khách.
 *
 * Hộp thoại nói rõ HỆ QUẢ trước khi bấm, vì hai mức có ý nghĩa vận hành khác hẳn nhau và người
 * dùng không có cách nào đoán ra từ tên: `watchlist` chỉ nhắc người trực, `blocked` chặn yêu cầu
 * và đơn MỚI. Lý do bắt buộc — sáu tháng sau, một hồ sơ bị chặn không kèm lý do là một quyết
 * định không ai dám gỡ và cũng không ai giải thích được.
 */
export function CustomerRiskModal({
  open,
  customer,
  onClose,
}: {
  open: boolean;
  customer: TenantCustomerDetail | null;
  onClose: () => void;
}) {
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const mutation = useUpdateCustomerRisk();

  const resolver = useValidationResolver<CustomerRiskFormValues>(
    customerRiskSchema,
    'Customers.validation',
  );
  const { control, handleSubmit, reset } = useForm<CustomerRiskFormValues>({
    resolver,
    defaultValues: { riskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL, reason: '' },
  });
  const riskLevel = useWatch({ control, name: 'riskLevel' });

  const levelOptions = useMemo(
    () =>
      RISK_LEVEL_VALUES.map((value) => ({
        value,
        label: domainLabel('tenantCustomerRiskLevel', value),
      })),
    [domainLabel],
  );

  useEffect(() => {
    if (open && customer) {
      reset({
        riskLevel: customer.riskLevel as TenantCustomerRiskLevel,
        reason: customer.riskReason ?? '',
      });
    }
  }, [open, customer, reset]);

  const submit = handleSubmit((values) => {
    if (!customer) return;
    mutation.mutate(
      {
        id: customer.id,
        body: {
          riskLevel: values.riskLevel,
          reason: values.reason.trim() || null,
        },
      },
      {
        onSuccess: () => {
          message.success(t('risk.saved'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('risk.title')}
      open={open}
      size="sm"
      okText={tCommon('actions.save')}
      cancelText={tCommon('actions.close')}
      destructive={riskLevel === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED}
      confirmLoading={mutation.isPending}
      onOk={() => void submit()}
      onClose={onClose}
    >
      <DialogForm onSubmit={submit} labelWidth="md">
        <SelectField
          control={control}
          name="riskLevel"
          label={t('risk.level')}
          options={levelOptions}
        />
        <p className={styles.hint}>{t('hints.riskLevel')}</p>
        <TextAreaField
          control={control}
          name="reason"
          label={
            riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL
              ? t('risk.reasonOptional')
              : t('risk.reason')
          }
          rows={3}
          placeholder={t('risk.reasonPlaceholder')}
        />
        <p className={styles.hint}>{t('risk.privacy')}</p>
      </DialogForm>
    </ResponsiveDialog>
  );
}
