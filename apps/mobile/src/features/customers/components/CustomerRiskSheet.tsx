import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  TENANT_CUSTOMER_FIELD_MAX,
  TENANT_CUSTOMER_RISK_LEVEL,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { customerRiskSchema, type CustomerRiskFormValues } from '@xeprime/validators';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import { RISK_LEVEL_VALUES } from '../constants';
import { useUpdateCustomerRisk } from '../hooks/use-customers';
import type { TenantCustomerDetail } from '../api';

/**
 * Đổi mức rủi ro của khách (CUS-03).
 *
 * Tấm trượt nói rõ HỆ QUẢ trước khi bấm, vì hai mức có ý nghĩa vận hành khác hẳn nhau và người
 * dùng không có cách nào đoán ra từ tên: `watchlist` chỉ nhắc người trực, `blocked` chặn yêu cầu
 * và đơn MỚI. Lý do bắt buộc — sáu tháng sau, một hồ sơ bị chặn không kèm lý do là một quyết
 * định không ai dám gỡ và cũng không ai giải thích được.
 *
 * Nút lưu mang tông PHÁ HUỶ khi mức đang chọn là `blocked` — gương của `destructive` mà web
 * truyền cho `ResponsiveDialog`.
 */
export function CustomerRiskSheet({
  open,
  customer,
  onClose,
}: {
  open: boolean;
  customer: TenantCustomerDetail | null;
  onClose: () => void;
}) {
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
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
        body: { riskLevel: values.riskLevel, reason: values.reason.trim() || null },
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('risk.saved'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  const blocked = riskLevel === TENANT_CUSTOMER_RISK_LEVEL.BLOCKED;

  return (
    <BottomSheet open={open} onClose={onClose} title={t('risk.title')}>
      <YStack gap={space.md}>
        <SelectField
          control={control}
          name="riskLevel"
          label={t('risk.level')}
          options={levelOptions}
        />
        <Callout tone={blocked ? 'danger' : 'info'}>{t('hints.riskLevel')}</Callout>
        <TextField
          control={control}
          name="reason"
          label={
            riskLevel === TENANT_CUSTOMER_RISK_LEVEL.NORMAL
              ? t('risk.reasonOptional')
              : t('risk.reason')
          }
          multiline
          rows={3}
          maxLength={TENANT_CUSTOMER_FIELD_MAX.RISK_REASON}
          placeholder={t('risk.reasonPlaceholder')}
          hint={t('risk.privacy')}
        />
        <Button
          label={tCommon('save')}
          variant={blocked ? 'danger' : 'primary'}
          loading={mutation.isPending}
          onPress={() => void submit()}
        />
        <Button
          label={tCommon('close')}
          variant="ghost"
          disabled={mutation.isPending}
          onPress={onClose}
        />
      </YStack>
    </BottomSheet>
  );
}
