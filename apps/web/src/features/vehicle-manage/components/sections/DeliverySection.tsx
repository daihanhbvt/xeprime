'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Form, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { POLICY_SOURCE } from '@xeprime/types';

import { StickyFormActions } from '@/components/form/StickyFormActions';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DeliveryPolicySection } from '@/features/rental-policies/components/PolicySections';
import { formToSaveInput, policyToForm } from '@/features/rental-policies/form';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { policyFormSchema, type PolicyFormValues } from '@/features/rental-policies/schema';
import type { VehiclePricing } from '@/features/rental-policies/types';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './DeliverySection.module.css';

/**
 * Mục "Giao xe tận nơi" (mockup 8) — nguồn sự thật là CHÍNH SÁCH hiệu lực (`RentalPolicy`):
 * bật/tắt, bán kính tối đa, các bậc phí CỐ ĐỊNH theo khoảng cách (không phải đ/km — máy giá
 * `deliveryFeeFor` tra bậc). Dùng đúng `DeliveryPolicySection` của form chính sách, không có bảng
 * bậc thứ hai.
 *
 * Lưu = `PUT /vehicles/:id/pricing` với `source: vehicle` và TOÀN BỘ chính sách (các khối khác
 * lấy nguyên từ bản đang hiệu lực) — không gửi partial làm mất cọc/quá giờ/ưu đãi. Server đồng
 * bộ luôn `vehicles.delivery_enabled` và snapshot listing (ADR 0008).
 */
export function DeliverySection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const pricing = useVehiclePricing(vehicle.id);

  if (pricing.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (pricing.isError || !pricing.data) {
    return (
      <EmptyState
        variant="error"
        title={t('pricing.loadError')}
        description={tCommon('states.errorHint')}
        onRetry={() => void pricing.refetch()}
      />
    );
  }
  return <DeliveryForm pricing={pricing.data} vehicleId={vehicle.id} canEdit={canEdit} />;
}

function DeliveryForm({
  pricing,
  vehicleId,
  canEdit,
}: {
  pricing: VehiclePricing;
  vehicleId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.delivery');
  const tPolicies = useTranslations('RentalPolicies.sections');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const save = useSaveVehiclePricing(vehicleId);
  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  const base = pricing.policy ?? pricing.shopPolicy;

  const values = useMemo(() => policyToForm(base), [base]);
  const { control, handleSubmit, reset, formState } = useForm<PolicyFormValues>({
    resolver: yupResolver(policyFormSchema),
    context: { policyEditable: true },
    values,
  });
  const enabled = useWatch({ control, name: 'deliveryEnabled' });
  const tiers = useWatch({ control, name: 'deliveryTiers' }) ?? [];
  const radius = useWatch({ control, name: 'deliveryMaxRadiusKm' });
  const firstTierFree = tiers[0]?.toKm != null && (!tiers[0]?.fee || tiers[0]?.fee === 0);

  const submit = handleSubmit(async (next) => {
    try {
      await save.mutateAsync({ source: POLICY_SOURCE.VEHICLE, policy: formToSaveInput(next) });
      message.success(t('saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  });

  return (
    <Form component={false} layout="vertical" colon={false}>
      <form noValidate onSubmit={submit} className={styles.form}>
        <SectionCard headingLevel={1} title={t('title')} subtitle={t('subtitle')}>
          {!pricing.shopPolicy && !pricing.policy ? (
            <Alert type="info" showIcon message={t('noShopPolicyTitle')} description={t('noShopPolicyBody')} />
          ) : overriding ? (
            <Alert type="info" showIcon message={t('overriddenTitle')} description={t('overriddenBody')} />
          ) : (
            <Alert type="warning" showIcon message={t('inheritedTitle')} description={t('inheritedBody')} />
          )}

          <DeliveryPolicySection control={control} title={tPolicies('deliveryTitle')} disabled={!canEdit} />

          {enabled ? (
            <div className={styles.summary}>
              {firstTierFree && tiers[0]?.toKm != null ? (
                <span>{t('freeWithin', { km: tiers[0].toKm })}</span>
              ) : null}
              {radius != null ? <span>{t('manualBeyond', { km: radius })}</span> : null}
              <span className={styles.note}>{t('estimateNote')}</span>
              <span className={styles.note}>{t('tiersHint')}</span>
            </div>
          ) : null}
        </SectionCard>

        <StickyFormActions
          submitLabel={tActions('saveChanges')}
          cancelLabel={tActions('cancel')}
          onCancel={formState.isDirty ? () => reset(values) : undefined}
          submitting={save.isPending}
          disabled={!canEdit || !formState.isDirty}
        />
      </form>
    </Form>
  );
}
