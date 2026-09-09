'use client';

import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { formToSaveInput, policyToForm } from '../form';
import { policyFormSchema, type PolicyFormValues } from '../schema';
import type { SaveRentalPolicyInput, ShopRentalPolicy } from '../types';
import { PolicySections } from './PolicySections';

import styles from './ShopPolicyForm.module.css';

interface ShopPolicyFormProps {
  initial: ShopRentalPolicy;
  canEdit: boolean;
  submitting: boolean;
  onSubmit: (body: SaveRentalPolicyInput) => void;
}

/**
 * Form chính sách thuê mặc định của gian hàng (Figma `237:1557`).
 *
 * Thay đổi NHẠY CẢM: giá trị mới áp cho mọi lượt đặt mới của các xe đang kế thừa — nên trước
 * khi gửi luôn có bước xác nhận nêu rõ phạm vi ảnh hưởng và cam kết "đơn cũ giữ nguyên"
 * (snapshot bất biến ở backend). Thanh cảnh báo thay đổi chưa lưu bám theo `isDirty`.
 */
export function ShopPolicyForm({ initial, canEdit, submitting, onSubmit }: ShopPolicyFormProps) {
  const t = useTranslations('Shop.policies');
  const { modal } = App.useApp();
  const resolver = useValidationResolver<PolicyFormValues>(
    policyFormSchema,
    'Vehicles.pricing.validation',
  );
  const { control, handleSubmit, reset, formState } = useForm<PolicyFormValues>({
    resolver,
    values: policyToForm(initial.policy),
  });

  const confirmThenSubmit = handleSubmit((values) => {
    modal.confirm({
      title: t('confirm.title'),
      content:
        initial.inheritingVehicles > 0
          ? t('confirm.bodyInheriting', { count: initial.inheritingVehicles })
          : t('confirm.body'),
      okText: t('confirm.ok'),
      cancelText: t('dirtyDiscard'),
      onOk: () => onSubmit(formToSaveInput(values)),
    });
  });

  return (
    <form className={styles.form} onSubmit={confirmThenSubmit} noValidate>
      {initial.policy === null ? (
        <Alert
          className={styles.introAlert}
          type="info"
          showIcon
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : null}

      {formState.isDirty ? (
        <Alert
          className={styles.dirtyBar}
          type="warning"
          showIcon
          title={t('dirty')}
          action={
            <Button size="small" onClick={() => reset()} disabled={submitting}>
              {t('dirtyDiscard')}
            </Button>
          }
        />
      ) : null}

      <PolicySections
        control={control}
        disabled={!canEdit}
        // Mốc cũ theo NGÀY chưa quy đổi được: hiện cảnh báo để chủ xe chọn lại theo gói.
        legacyDiscountTiers={initial.policy?.legacyDiscountTiers}
        depositHint={
          initial.inheritingVehicles > 0
            ? t('depositHint', { count: initial.inheritingVehicles })
            : undefined
        }
      />

      <StickyFormActions
        submitLabel={t('submit')}
        cancelLabel={t('reset')}
        onCancel={formState.isDirty ? () => reset() : undefined}
        submitting={submitting}
        disabled={!canEdit}
      />
    </form>
  );
}
